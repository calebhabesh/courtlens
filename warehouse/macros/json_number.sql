{# A JSON number, or a numeric string such as "220.40". Anything else is null, never 0. #}
{% macro json_number(values, key) -%}
case
    when jsonb_typeof({{ values }} -> '{{ key }}') = 'number'
        then ({{ values }} ->> '{{ key }}')::numeric
    when ({{ values }} ->> '{{ key }}') ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$'
        then trim({{ values }} ->> '{{ key }}')::numeric
end
{%- endmacro %}
