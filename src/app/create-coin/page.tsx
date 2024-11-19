"use client";

import { Transaction } from "@solana/web3.js";
import { useForm } from "react-hook-form";
import { WalletButton } from "./WalletButton";

type TokenMetadata = {
  name: string;
  symbol: string;
  initialSol: number;
  image_base64: string;
  description: string;
};

type TokenMetadataForm = TokenMetadata & {
  image_base64: FileList;
};

const toBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject();
      }
    };
    reader.onerror = reject;
  });

export default function TransactionSignPage() {
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<TokenMetadataForm>();

  const convertFormData = async (
    tokenMetadata: TokenMetadataForm,
  ): Promise<TokenMetadata> => {
    return {
      ...tokenMetadata,
      image_base64: await toBase64(tokenMetadata.image_base64[0]),
    };
  };

  const createCoin = async (tokenMetadataForm: TokenMetadataForm) => {
    const tokenMetadata = await convertFormData(tokenMetadataForm);

    try {
      if (window.solana && window.solana.isPhantom) {
        // Connect to the wallet if not already connected
        const resp = await window.solana.connect();
        const publicKey = resp.publicKey.toString();

        // Fetch the transaction from the server
        const response = await fetch("/api/prepare_token_request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ publicKey, tokenMetadata }),
        });

        const { transaction: serializedTransaction } = await response.json();

        // Deserialize the transaction
        const transaction = Transaction.from(
          Buffer.from(serializedTransaction, "base64"),
        );

        // Sign the transaction using Phantom
        const signedTransaction =
          await window.solana.signTransaction(transaction);

        // Serialize the signed transaction
        const signedSerializedTransaction = signedTransaction
          .serialize()
          .toString("base64");

        // Send the signed transaction back to the server
        const verifyResponse = await fetch("/api/submit_signed_transaction", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            signedTransaction: signedSerializedTransaction,
          }),
        });

        const verifyResult = await verifyResponse.json();
        if (verifyResult.success) {
          // Transaction verified and authenticated
          console.log("Transaction verified successfully.");
        } else {
          // Verification failed
          console.error("Transaction verification failed:", verifyResult.error);
        }
      } else {
        console.error("Phantom wallet is not installed");
      }
    } catch (err) {
      console.error("Error signing transaction:", err);
    }
  };

  return (
    <div className="p-4 h-full flex flex-col">
      <WalletButton />
      <div className="m-auto max-h-[40%] bg-white p-6 rounded-[20px] overflow-scroll">
        <form
          onSubmit={handleSubmit(createCoin)}
          className="flex flex-col w-96 m-auto gap-7 justify-center"
        >
          <input
            type="text"
            placeholder="Name"
            {...register("name", { required: true })}
            className="border border-white rounded px-4 py-2 text-black"
          />

          <input
            type="text"
            placeholder="Symbol"
            {...register("symbol", { required: true })}
            className="border border-white rounded px-4 py-2 text-black"
          />

          <input
            type="number"
            step="any"
            placeholder="Initial SOL"
            {...register("initialSol", { required: true })}
            className="border border-white rounded px-4 py-2 text-black"
          />

          <input
            type="text"
            placeholder="Description"
            {...register("description")}
            className="border border-white rounded px-4 py-2 text-black"
          />

          <input
            type="file"
            placeholder="Image URL"
            {...register("image_base64", { required: true })}
            className="border border-white rounded px-4 py-2"
          />

          <button
            type="submit"
            className="border border-white rounded px-4 py-2 mt-4"
            disabled={isSubmitting}
          >
            Create coin
          </button>
        </form>
      </div>
    </div>
  );
}
