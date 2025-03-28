import CoinDrop from "@/components/coindrop";
import Loader from "@/components/loader";
import "react-loading-skeleton/dist/skeleton.css";

export default function Profile() {
  return (
    <>
      <Loader />
      <CoinDrop imageUrl="/example.png" />
    </>
  );
}
