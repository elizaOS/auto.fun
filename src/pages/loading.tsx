import CoinDrop from "@/components/coindrop";
import Loader from "@/components/loader";
import "react-loading-skeleton/dist/skeleton.css";

export default function Profile() {
  return (
    <>
    <Loader />
    <CoinDrop imageUrl="https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/Foto_de_Jose_Eloy_Mart%C3%ADnez_Sim%C3%B3_%28edt.%29.jpg/1280px-Foto_de_Jose_Eloy_Mart%C3%ADnez_Sim%C3%B3_%28edt.%29.jpg" />
    </>
  );
}
