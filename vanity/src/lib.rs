use worker::*;

mod vanity;
use vanity::VanityRequest;

#[event(fetch)]
pub async fn main(req: Request, _env: Env, _ctx: worker::Context) -> Result<Response> {
    console_error_panic_hook::set_once();
    
    // Match on the URL pathname
    let url = req.url()?;
    match url.path() {
        "/" => handle_root().await,
        "/grind" if req.method() == Method::Post => handle_grind(req).await,
        "/test-auto" => handle_test_auto().await,
        _ => Response::error("Not Found", 404),
    }
}

async fn handle_root() -> Result<Response> {
    Response::ok("Vanity Solana Address Generator - POST to /grind or GET /test-auto for a test")
}

// Handler for the vanity address generation endpoint
async fn handle_grind(mut req: Request) -> Result<Response> {
    // Parse JSON request
    let vanity_req: VanityRequest = match req.json().await {
        Ok(json) => json,
        Err(e) => return Response::error(format!("Invalid JSON: {}", e), 400),
    };
    
    // Process request
    match vanity::grind_vanity(vanity_req).await {
        Ok(response) => Response::from_json(&response),
        Err(e) => Response::error(e.to_string(), 400),
    }
}

// Test handler that generates a key pair with the suffix "auto"
async fn handle_test_auto() -> Result<Response> {
    // Create a vanity request for a key with the suffix "auto"
    let request = VanityRequest {
        target: "auto".to_string(),
        case_insensitive: Some(false),
        position: Some("suffix".to_string()),
    };
    
    // Process request
    match vanity::grind_vanity(request).await {
        Ok(response) => Response::from_json(&response),
        Err(e) => Response::error(e.to_string(), 400),
    }
}
