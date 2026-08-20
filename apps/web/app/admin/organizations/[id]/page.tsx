import { redirect } from "next/navigation";

export default async function AdminOrganizationRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/admin/dietitians/${id}`);
}
