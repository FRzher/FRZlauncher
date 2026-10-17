use std::fs::{self, File};
use std::io::Write;
use std::path::PathBuf;
use keyring::Entry;

use crate::models::Account;

const SERVICE_NAME: &str = "com.frzlauncher.credentials";

#[derive(Clone, Debug)]
pub struct KeyringService {
    accounts_file: PathBuf,
}

impl KeyringService {
    pub fn new(base_dir: PathBuf) -> Self {
        let accounts_file = base_dir.join("accounts.json");
        Self { accounts_file }
    }

    /// Store a secure token in the OS Keyring (Windows Credential Manager)
    pub fn store_token(&self, account_id: &str, token: &str) -> Result<(), String> {
        let entry = Entry::new(SERVICE_NAME, account_id).map_err(|e| e.to_string())?;
        entry.set_password(token).map_err(|e| e.to_string())
    }

    /// Retrieve a secure token from the OS Keyring
    pub fn get_token(&self, account_id: &str) -> Result<String, String> {
        let entry = Entry::new(SERVICE_NAME, account_id).map_err(|e| e.to_string())?;
        entry.get_password().map_err(|e| e.to_string())
    }

    /// Delete a secure token from the OS Keyring
    pub fn delete_token(&self, account_id: &str) -> Result<(), String> {
        let entry = Entry::new(SERVICE_NAME, account_id).map_err(|e| e.to_string())?;
        let _ = entry.delete_credential();
        Ok(())
    }

    /// Save account metadata to accounts.json (without sensitive tokens)
    pub fn save_account(&self, mut account: Account, token: Option<&str>) -> Result<(), String> {
        let mut accounts = self.get_accounts().unwrap_or_default();

        // If an account with the same ID or (provider + username) already exists, reuse its ID
        if let Some(pos) = accounts.iter().position(|a| {
            a.id == account.id
                || (a.provider == account.provider
                    && a.username.eq_ignore_ascii_case(&account.username))
        }) {
            account.id = accounts[pos].id.clone();
            accounts.remove(pos);
        }

        if let Some(t) = token {
            self.store_token(&account.id, t)?;
        }

        // If this account is set to active, deactivate all others
        if account.is_active {
            for acc in &mut accounts {
                acc.is_active = false;
            }
        }

        accounts.push(account);
        self.save_accounts_file(&accounts)
    }

    /// Get all stored accounts metadata
    pub fn get_accounts(&self) -> Result<Vec<Account>, String> {
        if !self.accounts_file.exists() {
            return Ok(Vec::new());
        }

        let content = fs::read_to_string(&self.accounts_file).map_err(|e| e.to_string())?;
        let accounts: Vec<Account> = serde_json::from_str(&content).map_err(|e| e.to_string())?;
        Ok(accounts)
    }

    /// Get the currently active account
    pub fn get_active_account(&self) -> Result<Option<Account>, String> {
        let accounts = self.get_accounts()?;
        Ok(accounts.into_iter().find(|a| a.is_active))
    }

    /// Set an account as the active account
    pub fn set_active_account(&self, id: &str) -> Result<(), String> {
        let mut accounts = self.get_accounts()?;
        let mut found = false;

        for acc in &mut accounts {
            if acc.id == id {
                acc.is_active = true;
                found = true;
            } else {
                acc.is_active = false;
            }
        }

        if !found {
            return Err(format!("Account with ID '{}' not found", id));
        }

        self.save_accounts_file(&accounts)
    }

    /// Delete an account and its credentials
    pub fn delete_account(&self, id: &str) -> Result<(), String> {
        let mut accounts = self.get_accounts()?;
        accounts.retain(|a| a.id != id);

        let _ = self.delete_token(id);
        self.save_accounts_file(&accounts)
    }

    fn save_accounts_file(&self, accounts: &[Account]) -> Result<(), String> {
        if let Some(parent) = self.accounts_file.parent() {
            let _ = fs::create_dir_all(parent);
        }

        let json = serde_json::to_string_pretty(accounts).map_err(|e| e.to_string())?;
        let temp_path = self.accounts_file.with_extension("json.tmp");

        let mut file = File::create(&temp_path).map_err(|e| e.to_string())?;
        file.write_all(json.as_bytes()).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;

        fs::rename(temp_path, &self.accounts_file).map_err(|e| e.to_string())?;
        Ok(())
    }
}
