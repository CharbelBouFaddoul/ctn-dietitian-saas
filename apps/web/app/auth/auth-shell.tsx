"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthLayout, type AuthLayoutAudience } from "@nutrition-saas/ui";
import { API_URL } from "../../lib/api";

export type AuthAudience = "chooser" | "admin" | "dietitian" | "client";

export function AuthShell({
  title,
  audience = "dietitian",
  description,
  children,
}: {
  title: string;
  audience?: AuthAudience;
  description?: string;
  children: ReactNode;
}) {
  const layoutAudience: AuthLayoutAudience =
    audience === "admin" ? "admin" : audience === "client" ? "client" : "dietitian";

  return (
    <AuthLayout
      title={title}
      description={description}
      audience={layoutAudience}
      eyebrow={audience === "client" ? "Patient portal" : audience === "admin" ? "Platform" : "Clinic"}
      backHref="/"
      backLabel="Back to website"
      footer={<AuthFooter audience={audience} />}
    >
      {children}
    </AuthLayout>
  );
}

function AuthFooter({ audience }: { audience: AuthAudience }) {
  const pathname = usePathname() ?? "";
  const onPatientLogin = pathname.startsWith("/auth/client/login");
  const onDietitianLogin = pathname.startsWith("/auth/dietitian/login");
  const [patientRegistrationEnabled, setPatientRegistrationEnabled] = useState(false);
  const [dietitianRegistrationEnabled, setDietitianRegistrationEnabled] = useState(false);

  useEffect(() => {
    void fetch(`${API_URL}/api/v1/public/site-settings`)
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as {
          dietitianRegistrationEnabled?: boolean;
          patientRegistrationEnabled?: boolean;
          registrationEnabled?: boolean;
        };
        setDietitianRegistrationEnabled(
          data.dietitianRegistrationEnabled === true ||
            (data.dietitianRegistrationEnabled === undefined && data.registrationEnabled === true),
        );
        setPatientRegistrationEnabled(
          data.patientRegistrationEnabled === true ||
            (data.patientRegistrationEnabled === undefined && data.registrationEnabled === true),
        );
      })
      .catch(() => undefined);
  }, []);

  if (audience === "admin") {
    return (
      <p className="ui-muted" style={{ marginTop: 20, fontSize: 13 }}>
        <Link href="/auth/forgot-password" className="ui-link">
          Forgot password
        </Link>
      </p>
    );
  }

  if (audience === "client") {
    const links: ReactNode[] = [];
    if (!onPatientLogin) {
      links.push(
        <Link key="patient-login" href="/auth/client/login" className="ui-link">
          Patient sign in
        </Link>,
      );
    }
    if (patientRegistrationEnabled) {
      links.push(
        <Link key="patient-register" href="/auth/client/register" className="ui-link">
          Create patient account
        </Link>,
      );
    }
    links.push(
      <Link key="forgot" href="/auth/forgot-password" className="ui-link">
        Forgot password
      </Link>,
    );

    return (
      <p className="ui-auth__footer">
        {links.map((link, index) => (
          <span key={index}>
            {index > 0 ? " · " : null}
            {link}
          </span>
        ))}
        {patientRegistrationEnabled ? (
          <span className="ui-muted" style={{ display: "block", marginTop: 8 }}>
            Create your patient account, then enter the join code provided by your dietitian.
          </span>
        ) : (
          <span className="ui-muted" style={{ display: "block", marginTop: 8 }}>
            Sign in, then enter the join code provided by your dietitian.
          </span>
        )}
        <span className="ui-muted" style={{ display: "block", marginTop: 8 }}>
          Dietitian?{" "}
          <Link href="/auth/dietitian/login" className="ui-link">
            Sign in as Dietitian
          </Link>
        </span>
      </p>
    );
  }

  const links: ReactNode[] = [];
  if (!onDietitianLogin) {
    links.push(
      <Link key="dietitian-login" href="/auth/dietitian/login" className="ui-link">
        Dietitian sign in
      </Link>,
    );
  }
  if (dietitianRegistrationEnabled) {
    links.push(
      <Link key="dietitian-register" href="/auth/dietitian/register" className="ui-link">
        Create clinic account
      </Link>,
    );
  } else {
    links.push(
      <Link key="contact" href="/contact" className="ui-link">
        Contact us
      </Link>,
    );
  }
  links.push(
    <Link key="forgot" href="/auth/forgot-password" className="ui-link">
      Forgot password
    </Link>,
  );

  return (
    <p className="ui-auth__footer">
      {links.map((link, index) => (
        <span key={index}>
          {index > 0 ? " · " : null}
          {link}
        </span>
      ))}
      <span className="ui-muted" style={{ display: "block", marginTop: 8 }}>
        Patient?{" "}
        <Link href="/auth/client/login" className="ui-link">
          Sign in as Patient
        </Link>
      </span>
    </p>
  );
}
