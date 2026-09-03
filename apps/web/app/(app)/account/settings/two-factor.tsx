'use client';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardTitle,
  Field,
  Input,
  Spinner,
} from '@nexora/ui';
import { useState } from 'react';
import { toast } from 'sonner';
import { authClient } from '../../../../lib/auth-client';

type Stage = 'idle' | 'confirm-password' | 'scan' | 'backup-codes';

/**
 * TOTP two-factor setup.
 *
 * Enabling it requires the current password, so a stolen session cannot add a
 * second factor the real owner does not control. The backup codes are shown
 * exactly once - they are the only way back in if the authenticator is lost.
 */
export function TwoFactorSetup({ enabled }: { enabled: boolean }) {
  const [stage, setStage] = useState<Stage>('idle');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [totpUri, setTotpUri] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function begin() {
    setError(undefined);
    setPending(true);

    const { data, error: enableError } = await authClient.twoFactor.enable({ password });

    if (enableError || !data) {
      setError(enableError?.message ?? 'That password was not accepted.');
      setPending(false);
      return;
    }

    // Better Auth returns either a TOTP setup or an email-OTP one, depending on
    // how the plugin is configured. Only the TOTP shape carries a URI to scan.
    if (data.method !== 'totp') {
      setError('This account is set up for email codes rather than an authenticator app.');
      setPending(false);
      return;
    }

    setTotpUri(data.totpURI);
    setBackupCodes(data.backupCodes);
    setStage('scan');
    setPending(false);
  }

  async function confirm() {
    setError(undefined);
    setPending(true);

    const { error: verifyError } = await authClient.twoFactor.verifyTotp({ code });

    if (verifyError) {
      setError(verifyError.message ?? 'That code was not accepted. Try the next one.');
      setPending(false);
      return;
    }

    setStage('backup-codes');
    setPending(false);
    toast.success('Two-factor authentication is on');
  }

  async function disable() {
    setError(undefined);
    setPending(true);

    const { error: disableError } = await authClient.twoFactor.disable({ password });

    if (disableError) {
      setError(disableError.message ?? 'That password was not accepted.');
      setPending(false);
      return;
    }

    setPending(false);
    setStage('idle');
    setPassword('');
    toast.success('Two-factor authentication is off');
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5 pt-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle>Two-factor authentication</CardTitle>
            <CardDescription>
              A code from your authenticator app, on top of your password.
            </CardDescription>
          </div>
          <Badge tone={enabled ? 'success' : 'neutral'}>{enabled ? 'On' : 'Off'}</Badge>
        </div>

        {error ? (
          <p
            role="alert"
            className="border-danger/30 bg-danger-soft text-danger rounded-sm border px-3 py-2 text-[13px]"
          >
            {error}
          </p>
        ) : null}

        {stage === 'idle' ? (
          <Button
            variant={enabled ? 'secondary' : 'primary'}
            onClick={() => setStage('confirm-password')}
          >
            {enabled ? 'Turn off' : 'Turn on'}
          </Button>
        ) : null}

        {stage === 'confirm-password' ? (
          <div className="space-y-3">
            <Field
              label="Confirm your password"
              required
              hint="Required so a stolen session cannot change your second factor."
            >
              {(props) => (
                <Input
                  {...props}
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              )}
            </Field>

            <div className="flex gap-2">
              <Button
                variant="primary"
                onClick={enabled ? disable : begin}
                disabled={pending || password.length === 0}
                aria-busy={pending}
              >
                {pending ? <Spinner label="Working" /> : null}
                Continue
              </Button>
              <Button variant="ghost" onClick={() => setStage('idle')}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {stage === 'scan' ? (
          <div className="space-y-3">
            <p className="text-fg-muted text-[13px]">
              Add this to your authenticator app, then enter the six-digit code it shows.
            </p>

            {/* The URI in full, so a password manager or a desktop authenticator
                can take it without a camera. */}
            <code className="bg-surface-2 text-fg-muted block overflow-x-auto rounded-sm p-2 font-mono text-[11px]">
              {totpUri}
            </code>

            <Field label="Six-digit code" required>
              {(props) => (
                <Input
                  {...props}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="123456"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                />
              )}
            </Field>

            <Button
              variant="primary"
              onClick={confirm}
              disabled={pending || code.length !== 6}
              aria-busy={pending}
            >
              {pending ? <Spinner label="Verifying" /> : null}
              Verify and turn on
            </Button>
          </div>
        ) : null}

        {stage === 'backup-codes' ? (
          <div className="space-y-3">
            <p className="text-fg text-[13px] font-medium">
              Save these backup codes somewhere safe.
            </p>
            <p className="text-fg-muted text-[13px]">
              They are shown once. Each works a single time, and they are the only way in if you
              lose your authenticator.
            </p>

            <ul className="bg-surface-2 grid grid-cols-2 gap-1 rounded-sm p-3 font-mono text-[12px]">
              {backupCodes.map((backupCode) => (
                <li key={backupCode}>{backupCode}</li>
              ))}
            </ul>

            <Button variant="secondary" onClick={() => setStage('idle')}>
              I have saved them
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
