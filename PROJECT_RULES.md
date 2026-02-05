# OGDealer Project Rules

## Database Schema Rule

- Before writing ANY Supabase query (`.select`, `.insert`, `.update`, `.order`), reference `DATABASE_SCHEMA.md` to verify column names exist
- After ANY database migration or schema change, regenerate `DATABASE_SCHEMA.md` by running the schema query
- Never guess column names - if unsure, check the schema file first

### Regenerating the Schema

After making database changes, update `DATABASE_SCHEMA.md`:

1. Review all migration files in `supabase/migrations/`
2. Update the relevant table documentation in `DATABASE_SCHEMA.md`
3. Include any new columns, constraints, or relationships
4. Update the "Last Updated" date at the top of the file

### Schema Query Reference

To query the current schema directly from Supabase:

```sql
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;
```

## Code Organization

### Form System Architecture

The form system has a two-tier structure:

1. **form_staging** - Discovered/uploaded forms in staging area
   - Forms are discovered via AI or manually uploaded
   - PDFs are analyzed and fields are extracted
   - Field mappings are created (AI-suggested then human-verified)

2. **form_library** - Production-ready forms
   - Forms are promoted from staging after verification
   - Used by DocumentRulesPage for dealers to configure packages
   - Must have `status: 'active'` to be visible to dealers

### Page Responsibilities

| Page | Purpose | User Type |
|------|---------|-----------|
| `DocumentRulesPage` | View forms, configure document packages | Dealer users |
| `DevConsolePage` | Discover forms, upload PDFs, analyze, map, promote | Admin only |

### Edge Functions

| Function | Purpose |
|----------|---------|
| `discover-state-forms` | AI-powered form discovery for a state |
| `map-form-fields` | Extract PDF fields and create mappings |
| `analyze-form-pdf` | Analyze PDF structure |
| `verify-form-mapping` | Validate field mappings |

## Supabase Conventions

### Storage Buckets

- `form-pdfs` - Store uploaded PDF form templates
- `form-templates` - Additional template files

### Common Patterns

Always check `DATABASE_SCHEMA.md` before using these patterns:

```javascript
// Correct - verified columns exist
const { data } = await supabase
  .from('form_library')
  .select('id, form_name, state, category, mapping_confidence')
  .eq('state', 'UT')
  .eq('status', 'active');

// Wrong - don't guess column names
const { data } = await supabase
  .from('form_library')
  .select('*')
  .eq('state_code', 'UT'); // ERROR: column is 'state', not 'state_code'
```
