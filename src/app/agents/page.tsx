import { AgentCard } from "@/components/agents/AgentCard";
import { AgentData } from "../../../types/components/agents/index.type";
import { AgentsContainer } from "@/components/agents";

const fakeWait = (milliseconds: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
};

export default async function AgentsPage() {
  // TODO: replace with an axios request to the backend
  const fakeAgentData: AgentData[] = [
    {
      id: "1",
      mediaSrc:
        "https://www.thedailybeast.com/resizer/v2/YKIETZ4CVFMUTF7QZE5HTUJ6P4.jpg?smart=true&auth=fd8dfaa4b87bb2cc85e15ee22887c981a73e9923bc2c559ddddb821a737ab8f2&width=1440&height=1080",
      name: "Penjamin",
      isActive: true,
      description:
        "Penjamin is a chaotic stoner dab pen who lives for fat blinkers and hates pricey refills. Always pushing for our wins in life, he is a perfect man, a perfect being of our creation",
    },
    {
      id: "2",
      mediaSrc:
        "https://www.thedailybeast.com/resizer/v2/YKIETZ4CVFMUTF7QZE5HTUJ6P4.jpg?smart=true&auth=fd8dfaa4b87bb2cc85e15ee22887c981a73e9923bc2c559ddddb821a737ab8f2&width=1440&height=1080",
      name: "Penjamin",
      isActive: true,
      description:
        "Penjamin is a chaotic stoner dab pen who lives for fat blinkers and hates pricey refills. Always pushing for our wins in life, he is a perfect man, a perfect being of our creation",
    },
    {
      id: "3",
      mediaSrc:
        "https://www.thedailybeast.com/resizer/v2/YKIETZ4CVFMUTF7QZE5HTUJ6P4.jpg?smart=true&auth=fd8dfaa4b87bb2cc85e15ee22887c981a73e9923bc2c559ddddb821a737ab8f2&width=1440&height=1080",
      name: "Penjamin",
      isActive: false,
      description:
        "Penjamin is a chaotic stoner dab pen who lives for fat blinkers and hates pricey refills. Always pushing for our wins in life, he is a perfect man, a perfect being of our creation",
    },
    {
      id: "4",
      mediaSrc:
        "https://www.thedailybeast.com/resizer/v2/YKIETZ4CVFMUTF7QZE5HTUJ6P4.jpg?smart=true&auth=fd8dfaa4b87bb2cc85e15ee22887c981a73e9923bc2c559ddddb821a737ab8f2&width=1440&height=1080",
      name: "Penjamin",
      isActive: true,
      description:
        "Penjamin is a chaotic stoner dab pen who lives for fat blinkers and hates pricey refills. Always pushing for our wins in life, he is a perfect man, a perfect being of our creation",
    },
    {
      id: "5",
      mediaSrc:
        "https://www.thedailybeast.com/resizer/v2/YKIETZ4CVFMUTF7QZE5HTUJ6P4.jpg?smart=true&auth=fd8dfaa4b87bb2cc85e15ee22887c981a73e9923bc2c559ddddb821a737ab8f2&width=1440&height=1080",
      name: "Penjamin",
      isActive: true,
      description:
        "Penjamin is a chaotic stoner dab pen who lives for fat blinkers and hates pricey refills. Always pushing for our wins in life, he is a perfect man, a perfect being of our creation",
    },
    {
      id: "6",
      mediaSrc:
        "https://www.thedailybeast.com/resizer/v2/YKIETZ4CVFMUTF7QZE5HTUJ6P4.jpg?smart=true&auth=fd8dfaa4b87bb2cc85e15ee22887c981a73e9923bc2c559ddddb821a737ab8f2&width=1440&height=1080",
      name: "Penjamin",
      isActive: false,
      description:
        "Penjamin is a chaotic stoner dab pen who lives for fat blinkers and hates pricey refills. Always pushing for our wins in life, he is a perfect man, a perfect being of our creation asdajwdjkajlskdjkaj wdajslkdjak wdkajslkdklajwk dk alskdjlk awdkj ",
    },
  ];

  // TODO: remove once we have API route to fetch data
  await fakeWait(1000); // fake loading data

  return (
    <AgentsContainer>
      {fakeAgentData.map((agentData) => {
        return <AgentCard key={agentData.id} {...agentData} />;
      })}
    </AgentsContainer>
  );
}
