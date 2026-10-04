import { Banner } from '@/components/ui/banner';
import { LEAD_SECTION_ID } from '../sections';
import { codexPageHref, type CodexEditorNotice, type CodexSubject } from '../subjects';

export function EditorNotice({
  notice,
  subject,
  sectionId,
  goneSectionId = null,
}: {
  notice: CodexEditorNotice;
  subject: CodexSubject;
  sectionId: string | null;
  goneSectionId?: string | null;
}) {
  if (notice === 'invalid') {
    return (
      <Banner tone="warn" className="m-3">
        That save was rejected because the content did not pass the page checks. Your text is kept below.
      </Banner>
    );
  }
  if (goneSectionId !== null) {
    return (
      <Banner tone="warn" className="m-3">
        A newer edit removed the section you were editing, so nothing was saved. Your text is kept at the end of the
        page below, ready to move where it belongs and publish.
      </Banner>
    );
  }
  const hash = sectionId === null || sectionId === LEAD_SECTION_ID ? undefined : sectionId;
  return (
    <Banner tone="warn" className="m-3">
      Someone published this page after you opened it, so nothing was saved. Your text is kept below. Saving again
      replaces their newer text with yours.{' '}
      <a
        href={codexPageHref(subject, { hash })}
        target="_blank"
        rel="noopener"
        className="font-semibold text-isk underline-offset-2 hover:underline"
      >
        See the latest version
      </a>
    </Banner>
  );
}
