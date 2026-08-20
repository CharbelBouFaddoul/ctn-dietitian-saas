import { redirect } from "next/navigation";

export default async function OrgsSlugRedirect({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  redirect(`/practice/${slug.join("/")}`);
}
