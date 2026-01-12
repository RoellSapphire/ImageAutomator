# Workflow Automation App - Design Guidelines

## Design Approach
**Selected System:** Linear-inspired productivity design with Material Design principles
**Justification:** This is a utility-focused automation tool requiring clarity, efficiency, and reliable interaction patterns. Linear's clean aesthetic combined with Material's comprehensive component library creates the optimal balance for a technical workflow application.

## Typography System
- **Primary Font:** Inter via Google Fonts CDN
- **Headings:** Font weights 600-700, sizes: text-3xl (page titles), text-xl (section headers), text-lg (card headers)
- **Body Text:** Font weight 400, text-base for primary content, text-sm for secondary info
- **Code/Filenames:** Font-mono, text-sm for file paths and technical data
- **Status Labels:** Font weight 500, text-xs uppercase for badges and state indicators

## Layout System
**Spacing Primitives:** Tailwind units of 2, 4, 6, and 8 (e.g., p-4, gap-6, mb-8)
- Consistent 8-unit rhythm for major sections
- 4-unit spacing for component internal padding
- 2-unit gaps for inline elements

**Container Strategy:**
- Main content area: max-w-7xl with px-4 responsive padding
- Single column layout on mobile, 2-column on desktop (sidebar + main)
- Left sidebar: Fixed width 280px for navigation and workflow steps
- Main content area: Flexible width for file operations

## Core Components

### Navigation & Structure
- **Sidebar Navigation:** Vertical menu with workflow step indicators (numbered circles), current step highlighted, completed steps with checkmarks
- **Top Bar:** App title, user profile dropdown, settings icon (Heroicons CDN)
- **Progress Indicator:** Linear progress bar showing overall workflow completion

### File Management Components
- **Upload Zone:** Large dashed border drop area (border-2 border-dashed), centered upload icon, "Drop ZIP file or click to browse" text, supported format indicator
- **File List Cards:** Compact cards with filename (truncated with ellipsis), file size, thumbnail preview (40x40px), action icons (rename, delete, enhance), checkbox for batch operations
- **Batch Actions Bar:** Sticky bottom bar appearing when files selected, showing count and action buttons

### Workflow Step Cards
Each step as expandable card:
- **Header:** Step number badge, title, status indicator (pending/in-progress/complete)
- **Content:** Configuration options, file list, action buttons
- **Footer:** Primary action button (full width on mobile, auto width on desktop)

### Form Elements
- **Text Inputs:** Border styling, focus ring, label above input, helper text below, error states with icon
- **Select Dropdowns:** Chevron icon, consistent padding matching text inputs
- **Toggle Switches:** For enable/disable features (e.g., auto-enhancement)
- **Folder Picker:** Button with folder icon, showing selected path in adjacent read-only input

### Status & Feedback
- **Toast Notifications:** Top-right positioning, auto-dismiss, success/error/info variants with appropriate icons
- **Loading States:** Skeleton screens for file lists, spinner for actions in progress
- **Empty States:** Centered icon, heading, descriptive text, primary action button

### WordPress Integration Panel
- **Connection Status:** Green/red indicator dot, last sync timestamp
- **Post Preview Card:** Title input, category/tag selectors, ARMember permission dropdown, featured image preview
- **Publishing Controls:** Save draft, schedule, publish now buttons in row layout

## Component Spacing
- Card padding: p-6 for desktop, p-4 for mobile
- Section vertical spacing: space-y-8 for major sections, space-y-4 within sections
- Button groups: gap-3 between buttons
- Form field spacing: space-y-6 for form sections

## Icons
**Library:** Heroicons (outline variant) via CDN
Key icons needed: upload-cloud, folder, image, cog, check-circle, x-circle, chevron-down, pencil, trash, external-link

## Images
**No hero image required** - This is a dashboard/tool interface focused on functionality
Images appear only as:
- File thumbnails (40x40px square, rounded corners)
- Image previews in enhancement step (responsive width, max-h-64)
- Empty state illustrations (centered, max-w-xs)

## Interactions
- **Hover States:** Subtle background tint on cards and list items
- **Focus States:** Distinct outline on all interactive elements
- **Drag & Drop:** Visual feedback with border highlight and background tint when dragging over drop zone
- **Animations:** Minimal - only for state transitions (toast slides, progress bar fills), keep duration under 200ms

## Responsive Behavior
- **Mobile (<768px):** Stack sidebar above content, full-width components, larger touch targets (min 44px)
- **Tablet (768-1024px):** Collapsible sidebar, 2-column file grid
- **Desktop (>1024px):** Fixed sidebar, 3-4 column file grid, all features visible