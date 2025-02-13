"use client"
import React from "react"
/* eslint @typescript-eslint/ban-ts-comment: "off" */
// @ts-ignore-next-line error
import { experimental_useFormState as useFormState } from "react-dom"
import Link from "next/link"
import { toast } from "react-toastify"

import InputComponent from "../components/input-component"
import FormComponent from "../components/form-component"
import Separator from "../components/separator"
import PrimaryButton from "../components/button/primary-button-component"
import SecondaryButton from "../components/button/secondary-button-component"
import { SubmitValue } from "../index.types"

import { submitForm } from "./email-login-server-action"
interface LoginProps {
  login_challenge: string
}

const EmailLoginForm = ({ login_challenge }: LoginProps) => {
  const [state, formAction] = useFormState(submitForm, {
    error: null,
    message: null,
  })

  if (state.error) {
    toast.error(state.message)
    state.error = null
  }

  return (
    <FormComponent action={formAction}>
      <input type="hidden" name="login_challenge" value={login_challenge} />
      <InputComponent
        data-testid="email_id_input"
        label="Email"
        type="email"
        id="email"
        name="email"
        required
        placeholder="Email Id"
      />
      <div className="flex items-center mb-4">
        <label className="text-[var(--inputColor)] text-sm flex items-center">
          <input
            type="checkbox"
            id="remember"
            name="remember"
            value="1"
            className="mr-2"
            style={{ width: "14px", height: "14px" }}
          />
          Remember me
        </label>
      </div>
      <Separator>or</Separator>
      <div className="flex justify-center mb-4">
        <div className="text-center text-sm w-60">
          <Link
            data-testid="sign_in_with_phone_text"
            href={`/login/phone?login_challenge=${login_challenge}`}
            replace
          >
            <p className="font-semibold text-sm">Sign in with phone</p>
          </Link>
        </div>
      </div>
      <div className="flex flex-col md:flex-row-reverse w-full gap-2">
        <PrimaryButton
          type="submit"
          id="accept"
          name="submit"
          value="Log in"
          data-testid="email_login_next_btn"
        >
          Next
        </PrimaryButton>
        <SecondaryButton
          type="button"
          id="reject"
          name="submit"
          value={SubmitValue.denyAccess}
          formNoValidate
        >
          Cancel
        </SecondaryButton>
      </div>
    </FormComponent>
  )
}
export default EmailLoginForm
