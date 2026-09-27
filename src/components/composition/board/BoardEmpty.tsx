import { LinkCharacterButton } from '@/components/composition/account/LinkCharacterButton';

export function BoardEmpty() {
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <p className="text-ui text-muted">
        No characters linked yet. Add one to see its skill queue, wallet, location and jobs here.
      </p>
      <LinkCharacterButton label="Add character" callbackURL="/" />
    </div>
  );
}
