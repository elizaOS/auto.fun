"use client";

import { useForm } from "react-hook-form";
import { createCoin } from "@/utils/wallet";

export type TokenMetadata = {
  name: string;
  symbol: string;
  initial_sol: number;
  image_base64: string;
  description: string;
};

type TokenMetadataForm = {
  name: string;
  symbol: string;
  initial_sol: string;
  image_base64: FileList;
  description: string;
};

function toBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      if (typeof reader.result !== "string") return reject();
      resolve(reader.result.split(",")[1]);
    }; // Remove the Data URL prefix
    reader.onerror = (error) => reject(error);
  });
}

export default function TransactionSignPage() {
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<TokenMetadataForm>();

  const convertFormData = async (
    tokenMetadata: TokenMetadataForm,
  ): Promise<TokenMetadata> => {
    const image_base64 = tokenMetadata.image_base64[0];
    console.log(image_base64);

    return {
      ...tokenMetadata,
      initial_sol: parseFloat(tokenMetadata.initial_sol),
      image_base64: `data:image/jpeg;base64,${await toBase64(image_base64)}`,
    };
  };

  const submitForm = async (tokenMetadataForm: TokenMetadataForm) => {
    console.log(tokenMetadataForm);
    await createCoin(await convertFormData(tokenMetadataForm));
  };

  return (
    <div className="p-4 h-full flex flex-col">
      {/* <WalletButton /> */}
      <div className="m-auto max-h-[40%] bg-white p-6 rounded-[20px] overflow-scroll">
        <form
          onSubmit={handleSubmit(submitForm)}
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
            {...register("initial_sol", { required: true })}
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
