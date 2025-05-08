"use client";

export default function TxToast({ signature }: { signature: string }) {
  const link = `https://solscan.io/tx/${signature}`;

  const linkToExplorer = () => {
    // open in new tab
    window.open(link, "_blank");
  };

  return (
    <div className="w-full space-y-2">
      <p>Transaction sent:</p>
      <button
        onClick={linkToExplorer}
        className="flex justify-center w-full border-green-500 border rounded-lg py-2 items-center"
      >
        <img src="/link.svg" alt="link" className="w-4 h-4 mr-2" />
        <p className="text-sm text-white font-bold">View</p>
      </button>
    </div>
  );
}
