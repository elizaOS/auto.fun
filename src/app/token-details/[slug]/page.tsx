export default async function TokenDetailsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <div className="pt-12">Token Details for ID {slug}</div>;
}
