import { CodexIndex, codexIndexMetadata, type SearchParams } from './codex-index';

export const metadata = codexIndexMetadata;

export default function CodexIndexPage({ searchParams }: { searchParams: SearchParams }) {
  return <CodexIndex searchParams={searchParams} />;
}
