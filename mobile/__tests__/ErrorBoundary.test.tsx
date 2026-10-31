import React from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { ErrorBoundary } from '../src/components/ErrorBoundary';

// Translations not ready, as at the root boundary. Pulling in the real module
// would also load its native locale lookup.
jest.mock('../src/i18n', () => ({ __esModule: true, default: { isInitialized: false } }));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {} },
}));

const mockNavigation = { canGoBack: false, goBack: jest.fn() };

jest.mock('../src/navigation/navigationRef', () => ({
  navigationRef: {
    isReady: () => true,
    canGoBack: () => mockNavigation.canGoBack,
    goBack: () => mockNavigation.goBack(),
  },
}));

jest.mock('../src/components/Touchable', () => {
  const { Pressable } = require('react-native');
  return { Touchable: Pressable };
});

let shouldThrow = true;

function Flaky() {
  if (shouldThrow) throw new Error('render failed');
  return <Text>working</Text>;
}

function render(showBack = false): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <ErrorBoundary showBack={showBack}>
        <Flaky />
      </ErrorBoundary>,
    );
  });
  return tree;
}

const textOf = (tree: ReactTestRenderer) => JSON.stringify(tree.toJSON());

function press(tree: ReactTestRenderer, label: string) {
  let node: ReactTestInstance | null = tree.root.findByProps({ children: label });
  while (node && !node.props.onPress) node = node.parent;
  act(() => node?.props.onPress());
}

describe('ErrorBoundary', () => {
  let silence: jest.SpyInstance;

  beforeEach(() => {
    shouldThrow = true;
    mockNavigation.canGoBack = false;
    mockNavigation.goBack.mockClear();
    // React logs every caught error, which is the point of the test.
    silence = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => silence.mockRestore());

  it('shows its message instead of a blank screen', () => {
    expect(textOf(render())).toContain('Something went wrong');
  });

  it('works before translations have loaded', () => {
    expect(textOf(render())).toContain('Try again');
  });

  it('recovers on retry once the problem has gone', () => {
    const tree = render();
    shouldThrow = false;
    press(tree, 'Try again');
    expect(textOf(tree)).toContain('working');
  });

  it('leaves working children alone', () => {
    shouldThrow = false;
    expect(textOf(render())).toContain('working');
  });

  it('offers no way back when there is nowhere to go', () => {
    expect(textOf(render(true))).not.toContain('Go back');
  });

  it('offers a way back from a broken screen', () => {
    mockNavigation.canGoBack = true;
    const tree = render(true);
    expect(textOf(tree)).toContain('Go back');
    press(tree, 'Go back');
    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('keeps the root boundary free of navigation', () => {
    mockNavigation.canGoBack = true;
    expect(textOf(render(false))).not.toContain('Go back');
  });
});
