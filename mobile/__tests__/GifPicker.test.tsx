import React from 'react';
import { FlatList, Text, TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { GifPicker } from '../src/screens/chat/GifPicker';

jest.mock('../src/config/env', () => ({ GIPHY_API_KEY: 'test-key' }));
jest.mock('@d11/react-native-fast-image', () => {
  const FastImage = () => null;
  FastImage.resizeMode = { cover: 'cover' };
  return { __esModule: true, default: FastImage };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));
jest.mock('../src/theme/ThemeContext', () => ({
  useTheme: () => ({ colors: jest.requireActual('../src/theme/tokens').lightColors }),
}));
jest.mock('../src/components/Icon', () => ({ Icon: () => null }));
jest.mock('../src/components/Touchable', () => {
  const { Pressable } = jest.requireActual('react-native');
  return { Touchable: Pressable };
});

const SEND_URL = 'https://media2.giphy.com/media/xyz/giphy.webp?cid=1';

const page = (id: string, totalCount = 1) => ({
  ok: true,
  json: async () => ({
    data: [
      {
        id,
        title: `gif ${id}`,
        images: {
          fixed_width_small: { webp: 'https://media2.giphy.com/media/xyz/100w.webp' },
          downsized: { url: SEND_URL },
        },
      },
    ],
    pagination: { total_count: totalCount, count: 1 },
  }),
});

describe('GifPicker', () => {
  let fetchMock: jest.Mock;
  const onPick = jest.fn();
  const flush = () => act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  const render = async () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<GifPicker onClose={() => {}} onPick={onPick} />);
    });
    act(() => {
      jest.advanceTimersByTime(0);
    });
    await flush();
    return tree;
  };
  const texts = (tree: ReactTestRenderer) =>
    tree.root.findAllByType(Text).map((node) => node.props.children);
  const search = async (tree: ReactTestRenderer, term: string) => {
    act(() => tree.root.findByType(TextInput).props.onChangeText(term));
    act(() => {
      jest.advanceTimersByTime(400);
    });
    await flush();
  };

  beforeEach(() => {
    jest.useFakeTimers();
    onPick.mockClear();
    fetchMock = jest.fn();
    (globalThis as { fetch: unknown }).fetch = fetchMock;
  });

  afterEach(() => jest.useRealTimers());

  it('opens on trending and always shows the GIPHY mark', async () => {
    fetchMock.mockResolvedValue(page('a'));
    const tree = await render();
    expect(fetchMock.mock.calls[0][0]).toContain('/trending?');
    expect(texts(tree)).toContain('gif.poweredBy');
    expect(tree.root.findByType(FlatList).props.data).toHaveLength(1);
  });

  it('hands back the GIF that was tapped', async () => {
    fetchMock.mockResolvedValue(page('a'));
    const tree = await render();
    const cell = tree.root.findByProps({ accessibilityLabel: 'gif a' });
    act(() => cell.props.onPress());
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'a', sendUrl: SEND_URL }));
  });

  it('waits for typing to stop before searching', async () => {
    fetchMock.mockResolvedValue(page('a'));
    const tree = await render();
    fetchMock.mockClear();
    act(() => tree.root.findByType(TextInput).props.onChangeText('c'));
    act(() => tree.root.findByType(TextInput).props.onChangeText('ca'));
    act(() => tree.root.findByType(TextInput).props.onChangeText('cat'));
    act(() => {
      jest.advanceTimersByTime(399);
    });
    expect(fetchMock).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('q=cat');
  });

  it('ignores a slow search that a newer one has overtaken', async () => {
    fetchMock.mockResolvedValueOnce(page('trending'));
    const tree = await render();
    let finishSlow!: (value: unknown) => void;
    fetchMock.mockReturnValueOnce(new Promise((resolve) => (finishSlow = resolve)));
    await search(tree, 'dog');
    fetchMock.mockResolvedValueOnce(page('cat'));
    await search(tree, 'cat');
    await act(async () => {
      finishSlow(page('dog'));
    });
    await flush();
    const [shown] = tree.root.findByType(FlatList).props.data;
    expect(shown.id).toBe('cat');
  });

  it('offers a retry when GIPHY fails, such as on a rate limit', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429 });
    const tree = await render();
    expect(texts(tree)).toContain('gif.loadFailed');

    fetchMock.mockResolvedValueOnce(page('a'));
    const retry = tree.root
      .findAll((node) => typeof node.props.onPress === 'function')
      .find((node) => node.props.accessibilityLabel !== 'gif.close');
    act(() => retry?.props.onPress());
    await flush();
    expect(tree.root.findByType(FlatList).props.data).toHaveLength(1);
  });

  it('says so when nothing matches', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [], pagination: { total_count: 0, count: 0 } }),
    });
    const tree = await render();
    expect(texts(tree)).toContain('gif.empty');
  });

  it('fetches the next page once, however many scroll events arrive', async () => {
    fetchMock.mockResolvedValueOnce(page('a', 10));
    const tree = await render();
    fetchMock.mockResolvedValueOnce(page('b', 10));
    const list = tree.root.findByType(FlatList);
    act(() => {
      list.props.onEndReached();
      list.props.onEndReached();
    });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(tree.root.findByType(FlatList).props.data.map((gif: { id: string }) => gif.id)).toEqual([
      'a',
      'b',
    ]);
  });
});
