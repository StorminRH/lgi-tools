let accessControl;

function installFixtureAccessControl(control) {
  if (accessControl) throw new Error('A fixture access controller is already installed');
  accessControl = control;
  return () => { accessControl = undefined; };
}

function requireFixtureAccessControl() {
  if (!accessControl) throw new Error('E2E_PREREQUISITE: access changes require run-owned fixtures');
  return accessControl;
}

module.exports = {
  installFixtureAccessControl,
  requireFixtureAccessControl,
};
