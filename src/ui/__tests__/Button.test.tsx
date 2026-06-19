import { Button } from '../Button';

// Behavioral tests via @testing-library/react-native are deferred until the
// React 19 / RN 0.85 / jest-expo 56 / RTL 14 toolchain stabilizes. RTL 14's
// render() currently returns an empty proxy in this combination. For now we
// verify the component exists with the expected contract.
describe('Button', () => {
  it('is exported as a function component', () => {
    expect(typeof Button).toBe('function');
  });
});
