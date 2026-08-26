-- Hide public Plans page by default (admin can re-enable via site settings).
ALTER TABLE "platform_settings" ALTER COLUMN "plans_page_enabled" SET DEFAULT false;

UPDATE "platform_settings"
SET
  "plans_page_enabled" = false,
  "cta_href" = '/contact',
  "nav_items" = '[
    {"href":"/how-it-works","label":"How it works","visible":true,"order":0},
    {"href":"/features","label":"Features","visible":true,"order":1},
    {"href":"/plans","label":"Plans","visible":false,"order":2},
    {"href":"/faq","label":"FAQ","visible":true,"order":3},
    {"href":"/contact","label":"Contact","visible":true,"order":4}
  ]'::jsonb,
  "footer_groups" = '[
    {
      "title":"Product",
      "links":[
        {"href":"/how-it-works","label":"How it works"},
        {"href":"/features","label":"Features"},
        {"href":"/faq","label":"FAQ"},
        {"href":"/contact","label":"Contact"}
      ]
    },
    {
      "title":"For Dietitians",
      "links":[
        {"href":"/auth/dietitian/login","label":"Dietitian sign in"},
        {"href":"/contact","label":"Contact us"}
      ]
    },
    {
      "title":"For Patients",
      "links":[
        {"href":"/auth/client/login","label":"Patient sign in"},
        {"href":"/how-it-works","label":"Join your dietitian"}
      ]
    }
  ]'::jsonb;
