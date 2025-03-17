import Button from "@/components/button";

export default function Page() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-4 gap-4">
        {Array(12)
          .fill("A")
          .map((token, _) => (
            <div
              key={_}
              className="bg-autofun-background-card p-5 rounded-md border"
            >
              <div className="flex flex-col gap-4">
                <Button variant="primary">Buy</Button>
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
