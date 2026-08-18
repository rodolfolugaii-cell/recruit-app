import ContractSignPage from "@/components/ContractSignPage";

/**
 * /contract/<token> — the public signing link.
 *
 * The token is the only credential, so it stays in the path and never reaches
 * the contracts table directly: ContractSignPage reads through the
 * contract_by_token RPC. See supabase/migrations/20260818000400_contracts.sql
 * for why.
 */
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ContractSignPage token={token} />;
}
