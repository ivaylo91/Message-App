import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { FormError } from '../src/components/FormError';

describe('FormError', () => {
  let say: jest.SpyInstance;

  beforeEach(() => {
    say = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  });

  afterEach(() => say.mockRestore());

  const render = (message: string) => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<FormError message={message} style={{}} />);
    });
    return tree;
  };

  it('tells a screen reader, which would otherwise hear nothing', () => {
    render('Wrong password');
    expect(say).toHaveBeenCalledWith('Wrong password');
  });

  it('speaks again when the error changes', () => {
    const tree = render('Wrong password');
    act(() => tree.update(<FormError message="Too many attempts" style={{}} />));
    expect(say).toHaveBeenLastCalledWith('Too many attempts');
    expect(say).toHaveBeenCalledTimes(2);
  });

  it('does not repeat itself on a re-render', () => {
    const tree = render('Wrong password');
    act(() => tree.update(<FormError message="Wrong password" style={{}} />));
    expect(say).toHaveBeenCalledTimes(1);
  });
});
