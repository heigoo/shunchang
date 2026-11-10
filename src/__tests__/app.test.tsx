import '@testing-library/jest-dom';
import { render } from '@lynx-js/react/testing-library';
import { expect, test } from '@rstest/core';

import { App } from '../App';

test('renders the shunchang shell', async () => {
  const { findByText } = render(<App />);

  expect(await findByText('顺场')).toBeInTheDocument();
  expect(await findByText('还没有手册')).toBeInTheDocument();
});
