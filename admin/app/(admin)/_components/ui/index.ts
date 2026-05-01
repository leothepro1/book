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

export { Badge, type BadgeProps, type BadgeTone } from './Badge';
export { Button, type ButtonProps, type ButtonVariant, type ButtonSize } from './Button';
export { Checkbox, type CheckboxProps } from './Checkbox';
export {
  Choicebox,
  ChoiceboxGroup,
  type ChoiceboxProps,
  type ChoiceboxGroupProps,
} from './Choicebox';
export { Input, type InputProps, type InputType, type InputSize } from './Input';
export { Menu, type MenuProps, type MenuItemProps, type MenuItemTone } from './Menu';
export { Modal, type ModalProps, type ModalVariant } from './Modal';
export { Spinner, type SpinnerProps, type SpinnerSize } from './Spinner';
export { Textarea, type TextareaProps } from './Textarea';
export {
  ToastProvider,
  useToast,
  type ToastApi,
  type ToastOptions,
  type ToastVariant,
} from './Toast';
export { Toggle, type ToggleProps, type ToggleSize } from './Toggle';
