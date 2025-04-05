use sha2::{Digest, Sha256};
use serde::{Deserialize, Serialize};
use rand::{rngs::ThreadRng, Rng};
use worker::*;
use ed25519_dalek::{Signer, SigningKey, Verifier, VerifyingKey};
use rand::rngs::OsRng;

// Define the structures for the vanity address grinding functionality
#[derive(Deserialize)]
pub struct VanityRequest {
    pub target: String,
    pub case_insensitive: Option<bool>,
    pub position: Option<String>, // "prefix", "suffix", or "anywhere" (default: "suffix")
}

#[derive(Serialize)]
pub struct VanityResponse {
    pub pubkey: String,
    pub private_key: String,
    pub attempts: u64,
    pub time_secs: f64,
}

// Core function to grind for a vanity address
pub async fn grind_vanity(req: VanityRequest) -> Result<VanityResponse> {
    let case_insensitive = req.case_insensitive.unwrap_or(false);
    let position = req.position.unwrap_or_else(|| "suffix".to_string());
    
    // Validate position
    if position != "prefix" && position != "suffix" && position != "anywhere" {
        return Err(Error::RustError(format!("Invalid position value: {}", position)));
    }
    
    // Validate and prepare target
    let target = get_validated_target(&req.target, case_insensitive)?;
    
    console_log!("Starting vanity search for: {} (position: {})", target, position);
    
    let start_time = js_sys::Date::now();
    let mut count = 0_u64;
    let mut csprng = OsRng;
    
    loop {
        // Generate a proper ed25519 signing key
        let signing_key = SigningKey::generate(&mut csprng);
        
        // Get the verifying key (public key)
        let verifying_key = signing_key.verifying_key();
        
        // Get the public key bytes
        let pubkey_bytes = verifying_key.to_bytes();
        
        // For Solana, we need to combine private key + public key bytes
        // Format: [private_key (32 bytes) | public_key (32 bytes)]
        let secret_key_bytes = signing_key.to_bytes();
        let mut keypair_bytes = Vec::with_capacity(64);
        keypair_bytes.extend_from_slice(&secret_key_bytes);
        keypair_bytes.extend_from_slice(&pubkey_bytes);
        
        // Convert public key to Base58 for vanity searching
        let pubkey_str = bs58::encode(&pubkey_bytes).into_string();
        
        // Convert full keypair to Base64 for storage - this matches Solana's format
        let keypair_str = bs58::encode(&keypair_bytes).into_string();
        
        let check_str = if case_insensitive {
            maybe_bs58_aware_lowercase(&pubkey_str)
        } else {
            pubkey_str.clone()
        };
        
        count += 1;
        
        // Check if this matches our target based on position
        let is_match = match position.as_str() {
            "prefix" => check_str.starts_with(&target),
            "suffix" => check_str.ends_with(&target),
            "anywhere" => check_str.contains(&target),
            _ => false,
        };
        
        if is_match {
            let time_secs = (js_sys::Date::now() - start_time) / 1000.0;
            
            console_log!(
                "Found match: {} after {} attempts in {:.2}s",
                pubkey_str, count, time_secs
            );
            
            return Ok(VanityResponse {
                pubkey: pubkey_str,
                private_key: keypair_str,
                attempts: count,
                time_secs,
            });
        }
        
        // Prevent blocking the worker for too long - yield every 1000 attempts
        if count % 1000 == 0 {
            // Yield to the event loop using a simple Promise delay
            let promise = js_sys::Promise::resolve(&wasm_bindgen::JsValue::NULL);
            let _ = wasm_bindgen_futures::JsFuture::from(promise).await;
        }
    }
}

fn get_validated_target(target: &str, case_insensitive: bool) -> Result<String> {
    // Static string of BS58 characters
    const BS58_CHARS: &str = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

    // Validate target (i.e. does it include 0, O, I, l)
    for c in target.chars() {
        if !BS58_CHARS.contains(c) {
            return Err(Error::RustError(format!("Invalid character in target: {}", c)));
        }
    }

    // Return bs58-aware lowercase if needed
    Ok(if case_insensitive {
        maybe_bs58_aware_lowercase(target)
    } else {
        target.to_string()
    })
}

fn maybe_bs58_aware_lowercase(target: &str) -> String {
    // L is only char that shouldn't be converted to lowercase in case-insensitivity case
    const LOWERCASE_EXCEPTIONS: &str = "L";

    target
        .chars()
        .map(|c| {
            if LOWERCASE_EXCEPTIONS.contains(c) {
                c
            } else {
                c.to_ascii_lowercase()
            }
        })
        .collect::<String>()
}