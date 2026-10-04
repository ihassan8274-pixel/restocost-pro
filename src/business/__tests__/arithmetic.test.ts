import { describe, it, expect } from 'vitest';
import { evalArithmetic, hasOperator } from '../arithmetic';

describe('evalArithmetic', () => {
  it('ظٹط­ط³ط¨ ط§ظ„ط£ط±ظ‚ط§ظ… ط§ظ„ط¨ط³ظٹط·ط©', () => {
    expect(evalArithmetic('12')).toBe(12);
    expect(evalArithmetic(' 12 ')).toBe(12);
    expect(evalArithmetic('24.5')).toBe(24.5);
  });

  it('ظٹط­ط³ط¨ ط§ظ„ط¹ظ…ظ„ظٹط§طھ ط§ظ„ط£ط±ط¨ط¹ â€” ط§ظ„ط­ط§ظ„ط© ط§ظ„طھظٹ ط·ظ„ط¨ظ‡ط§ ط§ظ„ظ…ط³طھط®ط¯ظ…', () => {
    expect(evalArithmetic('5*48')).toBe(240);          // ط§ظ„ظ…ط«ط§ظ„ ط§ظ„ظ…ط°ظƒظˆط±
    expect(evalArithmetic('12+3')).toBe(15);
    expect(evalArithmetic('120/4')).toBe(30);
    expect(evalArithmetic('100-25')).toBe(75);
  });

  it('ظٹط­طھط±ظ… ط§ظ„ط£ظˆظ„ظˆظٹط© ظˆط§ظ„ط£ظ‚ظˆط§ط³', () => {
    expect(evalArithmetic('2+3*4')).toBe(14);           // ظ„ط§ 20
    expect(evalArithmetic('(2+3)*4')).toBe(20);
    expect(evalArithmetic('2*24.5')).toBe(49);
    expect(evalArithmetic('(10+5)*3')).toBe(45);
  });

  it('ظٹط¯ط¹ظٹ ط§ظ„ط³ط§ظ„ط¨', () => {
    expect(evalArithmetic('-5')).toBe(-5);
    expect(evalArithmetic('-5*3')).toBe(-15);
    expect(evalArithmetic('10*-2')).toBe(-20);
  });

  it('ظٹط±ظپط¶ ط§ظ„ظ‚ط³ظ…ط© ط¹ظ„ظ‰ طµظپط± ط¨ط¯ظ„ ط¥ط±ط¬ط§ط¹ NaN ط£ظˆ Infinity', () => {
    expect(evalArithmetic('5/0')).toBeNull();
    expect(evalArithmetic('5%0')).toBeNull();
  });

  it('ظٹط±ظپط¶ ط§ظ„ظ†طµ â€” ظˆظ‡ط°ط§ ظ‡ظˆ ط³ط¨ط¨ ط¹ط¯ظ… ط§ط³طھط®ط¯ط§ظ… eval', () => {
    expect(evalArithmetic('alert(1)')).toBeNull();
    expect(evalArithmetic('1+alert')).toBeNull();
    expect(evalArithmetic('window.x')).toBeNull();
    expect(evalArithmetic('1;2')).toBeNull();
    expect(evalArithmetic('constructor')).toBeNull();
  });

  it('ظٹط±ظپط¶ ط§ظ„ط¨ظ†ظٹط© ط§ظ„ظ†ط§ظ‚طµط©', () => {
    expect(evalArithmetic('')).toBeNull();
    expect(evalArithmetic('1.2.3')).toBeNull();
    expect(evalArithmetic('(1+2')).toBeNull();
    expect(evalArithmetic('1+2)')).toBeNull();
    expect(evalArithmetic('*5')).toBeNull();
    expect(evalArithmetic('5*')).toBeNull();
  });

  it('يقبل النقطة العشرية', () => {
    expect(evalArithmetic('2.5*4')).toBe(10);
  });

  it('hasOperator ظٹظ…ظٹظ‘ط² ط§ظ„طھط¹ط¨ظٹط± ط¹ظ† ط§ظ„ط±ظ‚ظ… ط§ظ„ظ…ط¬ط±ظ‘ط¯', () => {
    expect(hasOperator('48')).toBe(false);
    expect(hasOperator('5*48')).toBe(true);
    expect(hasOperator('2,5')).toBe(false);   // ظپط§طµظ„ط© ط¹ط´ط±ظٹط© ظ„ظٹط³طھ ط¹ظ…ظ„ظٹط©
    expect(hasOperator('-5')).toBe(false);
  });
});
