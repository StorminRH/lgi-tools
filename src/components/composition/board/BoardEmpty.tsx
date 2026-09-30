import { LinkCharacterButton } from '@/components/composition/account/LinkCharacterButton';

export function BoardEmpty() {
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <p className="text-ui text-muted">
        No characters linked.
      </p>
      <LinkCharacterButton label="Add character" callbackURL="/" />
    </div>
  );
}
