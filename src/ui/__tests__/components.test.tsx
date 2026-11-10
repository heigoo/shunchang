import '@testing-library/jest-dom';
import { fireEvent, render } from '@lynx-js/react/testing-library';
import { expect, test } from '@rstest/core';

import { Badge } from '../Badge';
import { Button } from '../Button';
import { concentricRadius, GlassPanel } from '../GlassPanel';

test('Button renders its label', () => {
  const { getByText } = render(<Button label="新建手册" />);

  expect(getByText('新建手册')).toBeInTheDocument();
});

test('Button calls onTap when tapped', () => {
  let taps = 0;
  const { container } = render(
    <Button
      label="发车"
      onTap={() => {
        taps += 1;
      }}
    />,
  );

  const root = container.querySelector('.Btn');
  expect(root).not.toBeNull();
  fireEvent.tap(root!);

  expect(taps).toBe(1);
});

test('disabled Button does not call onTap', () => {
  let taps = 0;
  const { container } = render(
    <Button
      label="发车"
      disabled
      onTap={() => {
        taps += 1;
      }}
    />,
  );

  const root = container.querySelector('.Btn');
  expect(root).not.toBeNull();
  expect(root).toHaveClass('Btn--disabled');
  fireEvent.tap(root!);

  expect(taps).toBe(0);
});

test('Badge stamp renders bracket-wrapped text', () => {
  const { getByText } = render(<Badge label="LOCK 12:08" kind="stamp" />);

  expect(getByText('[LOCK 12:08]')).toBeInTheDocument();
});

test('GlassPanel renders its children', () => {
  const { getByText } = render(
    <GlassPanel radius={28} padding={8}>
      <text>03:20 后发车</text>
    </GlassPanel>,
  );

  expect(getByText('03:20 后发车')).toBeInTheDocument();
});

test('concentricRadius keeps inner radius parallel to the outer edge', () => {
  expect(concentricRadius(28, 8)).toBe(20);
});
