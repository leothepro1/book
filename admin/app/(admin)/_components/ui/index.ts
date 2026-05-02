/**
 * Admin UI component library.
 *
 * Single source of truth for admin-route reusable UI components.
 * See ./README.md for the full contract: file structure, API
 * conventions, dual-emit rules, allowed tokens, a11y baseline,
 * and Phase 1 promotion order.
 *
 * Components are added alphabetically below as they're promoted
 * through Phase 1: Button → TextInput → Textarea → Checkbox →
 * Toggle. Each promotion lands in its own PR; this barrel is
 * updated in the same PR.
 */

/**
 * Library-wide size enum. Components that support sizing (Button,
 * Calendar, Checkbox, Input, Textarea, Toggle) accept this exact
 * union; components that don't (Badge, Menu, Modal, Spinner, Toast)
 * are intentionally sized intrinsically by their content/use-case.
 */
export type Size = 'sm' | 'md' | 'lg';

export { Badge, type BadgeProps, type BadgeVariant } from './Badge';
export { Button, type ButtonProps, type ButtonVariant, type ButtonSize } from './Button';
export {
  Calendar,
  type CalendarProps,
  type CalendarMode,
  type CalendarSize,
  type DateRange,
} from './Calendar';
export { Checkbox, type CheckboxProps, type CheckboxSize } from './Checkbox';
export {
  Choicebox,
  ChoiceboxGroup,
  type ChoiceboxProps,
  type ChoiceboxGroupProps,
} from './Choicebox';
export { Input, type InputProps, type InputType, type InputSize } from './Input';
export { Menu, type MenuProps, type MenuItemProps, type MenuItemVariant } from './Menu';
export { Modal, type ModalProps, type ModalVariant } from './Modal';
export { Radio, type RadioProps, type RadioSize } from './Radio';
export {
  SearchInput,
  type SearchInputProps,
  type SearchInputSize,
} from './SearchInput';
export {
  SearchSelect,
  type SearchSelectProps,
  type SearchSelectItem,
} from './SearchSelect';
export { Skeleton, type SkeletonProps, type SkeletonRadius } from './Skeleton';
export { Slider, type SliderProps } from './Slider';
export { Spinner, type SpinnerProps, type SpinnerSize } from './Spinner';
export {
  Switch,
  type SwitchProps,
  type SwitchOption,
  type SwitchSize,
} from './Switch';
export { Textarea, type TextareaProps, type TextareaSize } from './Textarea';
export {
  ToastProvider,
  useToast,
  type ToastApi,
  type ToastOptions,
  type ToastVariant,
} from './Toast';
export { Toggle, type ToggleProps, type ToggleSize } from './Toggle';
