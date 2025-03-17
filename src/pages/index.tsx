import Button from "@/components/button";
import SkeletonImage from "@/components/skeleton-image";

export default function Page() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {Array(12)
          .fill("A")
          .map((token, _) => (
            <div
              key={_}
              className="bg-autofun-background-card p-5 rounded-md border"
            >
              <div className="flex flex-col gap-4">
                <SkeletonImage
                  src={`https://picsum.photos/seed/${_}/200/200`}
                  alt="image"
                  className="size-32"
                />
                <Button variant="primary" size="large">
                  Buy
                </Button>
                <Button variant="secondary">Buy</Button>
                <Button variant="primary" disabled>
                  Buy
                </Button>
                <Button variant="secondary" isLoading>
                  Buy
                </Button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
