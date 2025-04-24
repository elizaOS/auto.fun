import { useLocalStorage } from "@uidotdev/usehooks";
import { useState } from "react";

type CookieType = 'necessary' | 'analytics' | 'preferences';

export default function CookieProvider() {
    const [cookBannerInteracted, setCookieBannerInteracted] = useLocalStorage<boolean>(
    "cookieAccepted",
    false,
    );

    const [tosAccepted, setTosAccepted] = useLocalStorage<boolean>(
    "tosAccepted",
    false,
    );

    const [cookieTypeAccpted, setCookieTypeAccepted] = useLocalStorage<CookieType[]>("cookieTypeAccepted", []);

    const [acceptTypesSelected, setAcceptTypesSelected] = useState<CookieType[]>(["analytics", "preferences", "necessary"]);

    const changeAcceptedTypes = (type: CookieType) => {
        if (acceptTypesSelected.includes(type)) {
            setAcceptTypesSelected(acceptTypesSelected.filter((item) => item !== type));
        } else {
            setAcceptTypesSelected([...acceptTypesSelected, type]);
        }
    };

    const acceptCookies = () => {
        setCookieBannerInteracted(true);
        setCookieTypeAccepted(acceptTypesSelected);
        setAcceptTypesSelected([]);
    }

    const rejectCookies = () => {
        setCookieBannerInteracted(true);
        setCookieTypeAccepted([]);
        setAcceptTypesSelected([]);
    }

    const acceptAllCookies = () => {
        setCookieBannerInteracted(true);
        setCookieTypeAccepted(["analytics", "preferences", "necessary"]);
        setAcceptTypesSelected([]);
    }



  return (
    <>
      {!cookBannerInteracted && tosAccepted && (
        <div className="fixed bottom-0 bg-[#3f5669] z-1000 w-full py-4 flex flex-col gap-3 items-center">
            <p className="text-[20px] text-white">Cookie settings</p>
            <p className="text-white px-4 text-center">We use cookies to provide you with the best possible experience. 
            They also allow us to analyze user behaviour in order to constantly improve the website for you.
            </p>
            <div className="flex gap-4">
                <button className="bg-[#228B22] p-2 rounded-md text-white border" onClick={acceptAllCookies}>
                    <p>Accept all</p>
                </button>
                <button className="bg-gray-500 text-white p-2 rounded-md border" onClick={() => acceptCookies()}>
                    <p>Accept Selection</p>
                </button>
                <button className="bg-gray-500 text-white p-2 rounded-md border" onClick={() => rejectCookies()}>
                    <p>Reject all</p>
                </button>
            </div>
            <div className="flex gap-4 text-white">
                <div className="flex gap-2">
                    <input type="checkbox" checked={acceptTypesSelected.includes("necessary")} onChange={() => changeAcceptedTypes("necessary")}/>
                    <label>Necessary</label>
                </div>
                <div className="flex gap-2">
                    <input type="checkbox" checked={acceptTypesSelected.includes("analytics")} onChange={() => changeAcceptedTypes("analytics")}/>
                    <label>Analytics</label>
                </div>
                <div className="flex gap-2">
                    <input type="checkbox" checked={acceptTypesSelected.includes("preferences")} onChange={() => changeAcceptedTypes("preferences")}/>
                    <label>Preferences</label>
                </div>
            </div>

        </div>
      )}
    </>
  );
}
