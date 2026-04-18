import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PriceTierBadge from './price-tier-badge';

describe('PriceTierBadge', () => {
  it('tier + displayPrice → 렌더링', () => {
    render(
      <PriceTierBadge
        tier="$$"
        displayPrice="~₩40k"
        domain="product"
        thresholdLabel="₩25,000–₩50,000"
      />,
    );
    expect(screen.getByText(/\$\$/)).toBeInTheDocument();
    expect(screen.getByText(/~₩40k/)).toBeInTheDocument();
  });

  it('showInfo=true → ⓘ 버튼 표시', () => {
    render(
      <PriceTierBadge
        tier="$$"
        displayPrice="~₩40k"
        domain="product"
        thresholdLabel="₩25,000–₩50,000"
        showInfo
      />,
    );
    expect(screen.getByRole('button', { name: /price info/i })).toBeInTheDocument();
  });

  it('showInfo=false → ⓘ 버튼 미표시 (compact용)', () => {
    render(
      <PriceTierBadge
        tier="$$"
        displayPrice="~₩40k"
        domain="product"
        thresholdLabel="₩25,000–₩50,000"
        showInfo={false}
      />,
    );
    expect(screen.queryByRole('button', { name: /price info/i })).not.toBeInTheDocument();
  });

  it('displayPrice=null → "Price varies" 폴백', () => {
    render(
      <PriceTierBadge
        tier="$$"
        displayPrice={null}
        domain="product"
        thresholdLabel="₩25,000–₩50,000"
      />,
    );
    expect(screen.getByText(/\$\$/)).toBeInTheDocument();
    expect(screen.getByText('Price varies')).toBeInTheDocument();
  });

  it('tier=null → 아무것도 렌더링 안 함', () => {
    const { container } = render(
      <PriceTierBadge
        tier={null}
        displayPrice="~₩40k"
        domain="product"
        thresholdLabel="₩25,000–₩50,000"
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('aria-label에 도메인명 + 범위 포함', () => {
    render(
      <PriceTierBadge
        tier="$$"
        displayPrice="~₩40k"
        domain="product"
        thresholdLabel="₩25,000–₩50,000"
      />,
    );
    const el = screen.getByLabelText(/mid-range.*product/i);
    expect(el).toBeInTheDocument();
  });

  it('$, $$$ 티어도 렌더링된다', () => {
    const { rerender } = render(
      <PriceTierBadge tier="$" displayPrice="~₩20k" domain="product" thresholdLabel="₩25,000–₩50,000" />,
    );
    expect(screen.getByText(/\$/)).toBeInTheDocument();

    rerender(
      <PriceTierBadge tier="$$$" displayPrice="~₩60k" domain="treatment" thresholdLabel="₩50,000–₩200,000" />,
    );
    expect(screen.getByText(/\$\$\$/)).toBeInTheDocument();
  });
});
