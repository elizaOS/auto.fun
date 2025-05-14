const GridViewStats = ({
  title,
  iframes,
}: {
  title: string;
  iframes: string[];
}) => {
  return (
    <div className="my-4">
      <h2 className="text-2xl font-bold mb-4">{title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {iframes.map((iframe, index) => (
          <div key={index} className="border rounded-lg overflow-hidden">
            <iframe
              src={iframe}
              className="w-full h-64"
              title={`Stats iframe ${index + 1}`}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
export default function StatsPage() {
  return (
    <div className="mt-4 mx-4">
      <GridViewStats
        title="Addresses"
        iframes={[
          "https://dune.com/embeds/5133792/8462503?darkMode=true",
          "https://dune.com/embeds/5133792/8463015?darkMode=true",
          "https://dune.com/embeds/5133760/8462538?darkMode=true",
        ]}
      />
      <GridViewStats
        title="Fees"
        iframes={[
          "https://dune.com/embeds/5133738/8462511?darkMode=true",
          "https://dune.com/embeds/5133685/8465708?darkMode=true",
        ]}
      />
      <GridViewStats
        title="Volume"
        iframes={[
          "https://dune.com/embeds/5133685/8462540?darkMode=true",
          "https://dune.com/embeds/5133685/8465708?darkMode=true",
        ]}
      />
    </div>
  );
}
