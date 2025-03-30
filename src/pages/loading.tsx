import CoinDrop from "@/components/coindrop";
import Loader from "@/components/loader";

export default function Profile() {
  return (
    <>
      <Loader />
      <CoinDrop imageUrl="/example.png" />
    </>
  );
}
