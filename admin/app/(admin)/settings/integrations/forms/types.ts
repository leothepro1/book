export type FormFieldDefinition = {
  key: string;
  label: string;
  type: "text" | "password" | "checkbox" | "select" | "number";
  placeholder?: string;
  required?: boolean;
  options?: string[];
  default?: string | boolean | number;
  tooltip?: string;
};

export type ProviderFormDefinition = {
  fields: FormFieldDefinition[];
  helpText: string;
  docsUrl?: string;
  docsLabel?: string;
};
