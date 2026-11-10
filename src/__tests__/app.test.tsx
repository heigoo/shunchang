import '@testing-library/jest-dom';
import { render } from '@lynx-js/react/testing-library';
import { expect, test } from '@rstest/core';

import { App } from '../App';
import { clearAllForTest } from '../store/repository';

test('renders the shunchang shell', async () => {
  clearAllForTest();

  const { findByText } = render(<App />);

  expect(await findByText('顺场')).toBeInTheDocument();
  expect(await findByText('还没有手册')).toBeInTheDocument();
});
