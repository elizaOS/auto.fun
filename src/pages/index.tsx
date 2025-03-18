import Button from "@/components/button";
import { useQuery } from "@tanstack/react-query";
import { faker } from "@faker-js/faker";
import GridListSwitcher from "@/components/grid-list-switcher";
import { TableView } from "@/components/table-view";
import { useViewMode } from "@/hooks/use-view-mode";
import GridView from "@/components/grid-view";

export default function Page() {
  const [activeTab] = useViewMode();

  const query = useQuery({
    queryKey: ["tokens"],

    queryFn: async () => {
      function createRandomToken() {
        return {
          name: faker.lorem.word({ length: { min: 3, max: 5 } }),
          symbol: faker.finance.currency().code,
          image: faker.image.dataUri({ width: 200, height: 200 }),
          address: faker.finance.ethereumAddress(),
          marketcap: faker.number.int({ min: 12_000, max: 3_000_000 }),
          createdAt: faker.date.recent(),
          bondingCurvePercentage: faker.number.int({ min: 1, max: 100 }),
          description: faker.lorem.lines(3),
        };
      }
      return faker.helpers.multiple(createRandomToken, {
        count: 12,
      });
    },
    refetchInterval: 1_000,
  });

  const data = query?.data;

  return (
    <div className="flex flex-col gap-4">
      {/* Top Navigation */}
      <div className="flex items-center gap-3 flex-wrap-reverse lg:flex-wrap">
        <GridListSwitcher />
        <div className="flex items-center gap-3">
          <Button variant="outline">All</Button>
          <Button>Market Cap</Button>
          <Button variant="outline">Creation Time</Button>
        </div>
      </div>

      {activeTab === "grid" ? (
        <GridView data={data} />
      ) : (
        <TableView data={data} />
      )}
    </div>
  );
}