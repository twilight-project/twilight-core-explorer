import { AccountDetail } from '@/components/accounts/AccountDetail';

export const metadata = { title: "Account" };

export default async function AccountDetailPage(props: {
  params: Promise<{ address: string }>;
}) {
  const params = await props.params;
  return <AccountDetail address={params.address} />;
}
