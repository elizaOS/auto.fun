import * as anchor from "@coral-xyz/anchor";

async function main() {
    // Setup provider
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
