import { gidFrom } from './gid';

test('Converts to gid (regular)', () => {
  expect(gidFrom('Mass Effect 3')).toBe('gid-mass-effect-3');
});

test('Converts to gid (special characters)', () => {
  expect(gidFrom('Mass Effect 3: From Ashes')).toBe(
    'gid-mass-effect-3-from-ashes',
  );
});

test('Converts to gid (special characters at ends)', () => {
  expect(gidFrom('&Mass Effect 3: From Ashes (DLC)')).toBe(
    'gid-mass-effect-3-from-ashes-dlc',
  );
});
