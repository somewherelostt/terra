//! Spending allowances for a Sputnik DAO.
//!
//! The DAO (owner) funds this contract and gives a spender a daily cap, a
//! per-payment max and an expiry. The spender (a member, or an AI helper holding
//! a function-call key limited to `pay`) pays straight from here, without a vote.
//! Guardians (council members) can freeze everything instantly; only the DAO can
//! unfreeze. See design/ALLOWANCES.md.

use near_sdk::json_types::{U128, U64};
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::store::IterableMap;
use near_sdk::{env, near, require, AccountId, NearToken, PanicOnDefault, Promise};

const DAY_NS: u64 = 86_400 * 1_000_000_000;

#[near(serializers = [borsh])]
#[derive(Clone)]
pub struct Allowance {
    daily_cap: u128,
    per_payment_max: u128,
    expires_at: u64,
    day: u64,
    spent: u128,
}

#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct AllowanceView {
    pub account_id: AccountId,
    pub daily_cap: U128,
    pub per_payment_max: U128,
    pub expires_at: U64,
    pub spent_today: U128,
    pub left_today: U128,
}

#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct StateView {
    pub owner: AccountId,
    pub guardians: Vec<AccountId>,
    pub frozen: bool,
    pub balance: U128,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    owner: AccountId,
    guardians: Vec<AccountId>,
    frozen: bool,
    allowances: IterableMap<AccountId, Allowance>,
}

fn today() -> u64 {
    env::block_timestamp() / DAY_NS
}

/// What the account can actually send: balance minus what storage locks.
fn free_balance() -> u128 {
    let locked = env::storage_byte_cost().as_yoctonear() * env::storage_usage() as u128;
    env::account_balance().as_yoctonear().saturating_sub(locked)
}

#[near]
impl Contract {
    #[init]
    pub fn new(owner: AccountId, guardians: Vec<AccountId>) -> Self {
        Self { owner, guardians, frozen: false, allowances: IterableMap::new(b"a") }
    }

    fn assert_owner(&self) {
        require!(env::predecessor_account_id() == self.owner, "Only the group can do this");
    }

    // ----- Owner (DAO proposals) -----

    /// Create or replace an allowance. Attached NEAR funds the contract.
    #[payable]
    pub fn set_allowance(&mut self, account_id: AccountId, daily_cap: U128, per_payment_max: U128, expires_at: U64) {
        self.assert_owner();
        require!(per_payment_max.0 <= daily_cap.0, "Per-payment max can't be above the daily cap");
        require!(expires_at.0 > env::block_timestamp(), "Expiry is in the past");
        let (day, spent) = match self.allowances.get(&account_id) {
            Some(a) if a.day == today() => (a.day, a.spent),
            _ => (today(), 0),
        };
        self.allowances.insert(
            account_id,
            Allowance { daily_cap: daily_cap.0, per_payment_max: per_payment_max.0, expires_at: expires_at.0, day, spent },
        );
    }

    pub fn remove_allowance(&mut self, account_id: AccountId) {
        self.assert_owner();
        self.allowances.remove(&account_id);
    }

    pub fn unfreeze(&mut self) {
        self.assert_owner();
        self.frozen = false;
    }

    pub fn set_guardians(&mut self, guardians: Vec<AccountId>) {
        self.assert_owner();
        self.guardians = guardians;
    }

    /// Send unused budget back to the group.
    pub fn withdraw(&mut self, amount: U128) -> Promise {
        self.assert_owner();
        require!(amount.0 <= free_balance(), "Not enough in the allowance pool");
        Promise::new(self.owner.clone()).transfer(NearToken::from_yoctonear(amount.0))
    }

    // ----- Guardians -----

    /// Instant stop, no vote. Owner or any guardian.
    pub fn freeze(&mut self) {
        let caller = env::predecessor_account_id();
        require!(caller == self.owner || self.guardians.contains(&caller), "Only the council can freeze");
        self.frozen = true;
        env::log_str(&format!("frozen by {caller}"));
    }

    // ----- Spenders -----

    /// Pay from the caller's allowance. Takes no deposit, so a function-call key can call it.
    pub fn pay(&mut self, receiver_id: AccountId, amount: U128) -> Promise {
        require!(!self.frozen, "Allowances are frozen");
        require!(amount.0 > 0, "Amount must be above zero");
        let caller = env::predecessor_account_id();
        let mut a = self.allowances.get(&caller).cloned().unwrap_or_else(|| env::panic_str("No allowance for this account"));
        require!(env::block_timestamp() < a.expires_at, "Allowance has expired");
        require!(amount.0 <= a.per_payment_max, "Over the per-payment max");
        if a.day != today() {
            a.day = today();
            a.spent = 0;
        }
        let spent = a.spent.checked_add(amount.0).unwrap_or_else(|| env::panic_str("Overflow"));
        require!(spent <= a.daily_cap, "Over today's cap");
        require!(amount.0 <= free_balance(), "Not enough in the allowance pool");
        a.spent = spent;
        self.allowances.insert(caller.clone(), a);
        env::log_str(&format!("{caller} paid {} yocto to {receiver_id}", amount.0));
        Promise::new(receiver_id).transfer(NearToken::from_yoctonear(amount.0))
    }

    // ----- Views -----

    pub fn get_state(&self) -> StateView {
        StateView { owner: self.owner.clone(), guardians: self.guardians.clone(), frozen: self.frozen, balance: U128(free_balance()) }
    }

    pub fn get_allowance(&self, account_id: AccountId) -> Option<AllowanceView> {
        self.allowances.get(&account_id).map(|a| view_of(account_id, a))
    }

    pub fn get_allowances(&self) -> Vec<AllowanceView> {
        self.allowances.iter().map(|(k, a)| view_of(k.clone(), a)).collect()
    }
}

fn view_of(account_id: AccountId, a: &Allowance) -> AllowanceView {
    let spent = if a.day == today() { a.spent } else { 0 };
    AllowanceView {
        account_id,
        daily_cap: U128(a.daily_cap),
        per_payment_max: U128(a.per_payment_max),
        expires_at: U64(a.expires_at),
        spent_today: U128(spent),
        left_today: U128(a.daily_cap.saturating_sub(spent)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    const N: u128 = 10u128.pow(24);
    const T0: u64 = 1_000 * DAY_NS;

    fn acc(s: &str) -> AccountId {
        s.parse().unwrap()
    }

    fn ctx(caller: &str, ts: u64, deposit: u128) {
        testing_env!(VMContextBuilder::new()
            .current_account_id(acc("allowance.testnet"))
            .predecessor_account_id(acc(caller))
            .block_timestamp(ts)
            .account_balance(NearToken::from_yoctonear(10 * N))
            .attached_deposit(NearToken::from_yoctonear(deposit))
            .build());
    }

    fn setup() -> Contract {
        ctx("dao.testnet", T0, 0);
        let mut c = Contract::new(acc("dao.testnet"), vec![acc("ana.testnet")]);
        c.set_allowance(acc("bot.testnet"), U128(2 * N), U128(N), U64(T0 + 7 * DAY_NS));
        c
    }

    #[test]
    fn pays_within_limits_and_tracks_spend() {
        let mut c = setup();
        ctx("bot.testnet", T0 + 1, 0);
        c.pay(acc("shop.testnet"), U128(N));
        c.pay(acc("shop.testnet"), U128(N / 2));
        let a = c.get_allowance(acc("bot.testnet")).unwrap();
        assert_eq!(a.spent_today.0, 3 * N / 2);
        assert_eq!(a.left_today.0, N / 2);
    }

    #[test]
    #[should_panic(expected = "Over the per-payment max")]
    fn refuses_over_per_payment_max() {
        let mut c = setup();
        ctx("bot.testnet", T0 + 1, 0);
        c.pay(acc("shop.testnet"), U128(N + 1));
    }

    #[test]
    #[should_panic(expected = "Over today's cap")]
    fn refuses_over_daily_cap() {
        let mut c = setup();
        ctx("bot.testnet", T0 + 1, 0);
        c.pay(acc("shop.testnet"), U128(N));
        c.pay(acc("shop.testnet"), U128(N));
        c.pay(acc("shop.testnet"), U128(1));
    }

    #[test]
    fn cap_resets_next_day() {
        let mut c = setup();
        ctx("bot.testnet", T0 + 1, 0);
        c.pay(acc("shop.testnet"), U128(N));
        c.pay(acc("shop.testnet"), U128(N));
        ctx("bot.testnet", T0 + DAY_NS, 0);
        assert_eq!(c.get_allowance(acc("bot.testnet")).unwrap().left_today.0, 2 * N);
        c.pay(acc("shop.testnet"), U128(N));
    }

    #[test]
    #[should_panic(expected = "Allowance has expired")]
    fn refuses_after_expiry() {
        let mut c = setup();
        ctx("bot.testnet", T0 + 7 * DAY_NS, 0);
        c.pay(acc("shop.testnet"), U128(1));
    }

    #[test]
    #[should_panic(expected = "No allowance for this account")]
    fn refuses_stranger() {
        let mut c = setup();
        ctx("eve.testnet", T0 + 1, 0);
        c.pay(acc("eve.testnet"), U128(1));
    }

    #[test]
    #[should_panic(expected = "Allowances are frozen")]
    fn guardian_freeze_stops_pay() {
        let mut c = setup();
        ctx("ana.testnet", T0 + 1, 0);
        c.freeze();
        ctx("bot.testnet", T0 + 2, 0);
        c.pay(acc("shop.testnet"), U128(1));
    }

    #[test]
    #[should_panic(expected = "Only the group can do this")]
    fn guardian_cannot_unfreeze() {
        let mut c = setup();
        ctx("ana.testnet", T0 + 1, 0);
        c.freeze();
        c.unfreeze();
    }

    #[test]
    fn dao_unfreeze_restores_pay() {
        let mut c = setup();
        ctx("ana.testnet", T0 + 1, 0);
        c.freeze();
        ctx("dao.testnet", T0 + 2, 0);
        c.unfreeze();
        ctx("bot.testnet", T0 + 3, 0);
        c.pay(acc("shop.testnet"), U128(1));
    }

    #[test]
    #[should_panic(expected = "Only the council can freeze")]
    fn stranger_cannot_freeze() {
        let mut c = setup();
        ctx("bot.testnet", T0 + 1, 0);
        c.freeze();
    }

    #[test]
    #[should_panic(expected = "Only the group can do this")]
    fn spender_cannot_raise_own_cap() {
        let mut c = setup();
        ctx("bot.testnet", T0 + 1, 0);
        c.set_allowance(acc("bot.testnet"), U128(100 * N), U128(100 * N), U64(T0 + 7 * DAY_NS));
    }

    #[test]
    #[should_panic(expected = "Per-payment max can't be above the daily cap")]
    fn rejects_bad_limits() {
        let mut c = setup();
        ctx("dao.testnet", T0 + 1, 0);
        c.set_allowance(acc("bot.testnet"), U128(N), U128(2 * N), U64(T0 + DAY_NS));
    }

    #[test]
    fn changing_limits_keeps_todays_spend() {
        let mut c = setup();
        ctx("bot.testnet", T0 + 1, 0);
        c.pay(acc("shop.testnet"), U128(N));
        ctx("dao.testnet", T0 + 2, 0);
        c.set_allowance(acc("bot.testnet"), U128(3 * N), U128(N), U64(T0 + DAY_NS));
        assert_eq!(c.get_allowance(acc("bot.testnet")).unwrap().left_today.0, 2 * N);
    }
}
