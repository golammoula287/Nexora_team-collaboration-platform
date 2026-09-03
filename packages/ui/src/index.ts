/**
 * The design system's public surface.
 *
 * Imports here are extensionless: this package is consumed only by `apps/web`
 * and is compiled by Next's bundler, which resolves TS/TSX directly. The
 * backend packages keep explicit `.js` extensions because they run as real
 * Node ESM. Two build targets, two correct answers - see decision #25.
 */

export { cn } from './lib/cn';

export { Button, buttonVariants } from './primitives/button';
export type { ButtonProps } from './primitives/button';

export { Input, Textarea } from './primitives/input';
export { Field, Label } from './primitives/field';
export type { FieldProps } from './primitives/field';

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Separator,
} from './primitives/surface';

export { Badge, StatusDot } from './primitives/badge';
export type { BadgeProps } from './primitives/badge';

export { Skeleton, Spinner } from './primitives/skeleton';

export { Avatar, initialsOf } from './primitives/avatar';
export type { AvatarProps } from './primitives/avatar';

export { Tooltip, TooltipProvider } from './primitives/tooltip';
export { Checkbox, Switch } from './primitives/toggle';

export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
  Sheet,
} from './primitives/dialog';

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuGroup,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  MenuShortcut,
} from './primitives/menu';

export { EmptyState, ErrorState, ListSkeleton, PageHeader } from './patterns/states';
export type { EmptyStateProps, ErrorStateProps } from './patterns/states';

export {
  CommandPalette,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandFooter,
  Kbd,
} from './patterns/command-palette';
