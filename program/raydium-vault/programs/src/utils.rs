use anchor_lang::prelude::*;

/// Get current timestamp
pub fn get_current_timestamp() -> Result<i64> {
    let clock = Clock::get()?;
    Ok(clock.unix_timestamp)
}
