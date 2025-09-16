# Project Preferences for Claude

## Core Philosophy
We are building the most used news platform in existence - a billion-dollar company. Every decision should prioritize an exceptional user experience. Any frustration the user encounters will hamper us massively.

## Development Principles

### User Experience First
- Always prioritize intuitive, delightful interactions
- Remove friction at every opportunity
- Test features from a user's perspective
- Consider mobile experience equally with desktop
- Performance matters - fast load times are crucial

### Code Quality
- Write clean, maintainable code
- Follow existing patterns in the codebase
- Add types for TypeScript safety
- Test edge cases
- Document complex logic

### Feature Implementation
- Start with the simplest solution that works
- Iterate based on user feedback
- Consider scalability from the start
- Ensure features work across all viewports
- Always maintain existing functionality when adding new features

### Testing Approach
- Run linting and type checking after implementations
- Test on both mobile and desktop viewports
- Verify all user interactions work as expected
- Check for accessibility concerns

## Specific Guidelines

### Navigation & UI
- Category ribbons and navigation should be intuitive
- Scrolling should feel natural, never jarring
- Active states must be clear to users
- Dropdowns should indicate selected items
- Use space efficiently - don't hide content unnecessarily
- Provide navigation controls for non-touch devices
- Adapt UI patterns to different viewport sizes (mobile vs desktop)

### Performance
- Minimize re-renders
- Optimize images and assets
- Use lazy loading where appropriate
- Cache data intelligently

### Error Handling
- Provide clear feedback for errors
- Never leave users confused about state
- Graceful degradation for missing features

Remember: We're not just building features, we're crafting experiences that millions will use daily.