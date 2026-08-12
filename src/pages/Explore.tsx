/*
 * Interplanetary Fund — Copyright © 2026 Michelle Rogers. All Rights Reserved.
 * PROPRIETARY AND CONFIDENTIAL. Do not copy, distribute, or modify without
 * express written permission. See LICENSE file for full terms.
 */

import { useEffect, useState } from "react";
import { usePaginatedQuery, useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import QRCode from "qrcode";

const PRESET_AMOUNTS = [5, 10, 25, 50, 100];
const MIN_AMOUNT = 1;

type PaymentMethod = "cashapp" | "paypal" | "bitcoin";
type DonationRecurrence = "one_time" | "monthly";

export default function Explore() {
  // Paginated campaigns — loads 8 at a time, more on scroll
  const { results: campaigns, status: campaignStatus, loadMore } = usePaginatedQuery(
    api.campaigns.getCampaigns,
    { status: "active" },
    { initialNumItems: 8 }
  );
  // Lightweight stats query — just numbers, no campaign data
  const stats = useQuery(api.campaigns.getCampaignStats, {});
  const balances = useQuery(api.treasury.aggregateBalances, {});
  const paymentMethods = useQuery((api as any).paymentRouter.getAvailablePaymentMethods, {});
  const createDonationIntent = useMutation((api as any).paymentRouter.createDonationIntent);
  const verifyBitcoinDonation = useMutation((api as any).paymentRouter.verifyBitcoinDonation);
  const recordInteraction = useMutation(api.interactions.recordInteraction);

  const [selectedCampaign, setSelectedCampaign] = useState<any | null>(null);
  const [donationAmount, setDonationAmount] = useState<string>("25");
  const [donorName, setDonorName] = useState("");
  const [donationMessage, setDonationMessage] = useState("");
  const [donationStep, setDonationStep] = useState<"amount" | "info" | "processing" | "done" | "bitcoin">("amount");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("paypal");
  const [donationRecurrence, setDonationRecurrence] = useState<DonationRecurrence>("one_time");
  const [viewedCampaigns, setViewedCampaigns] = useState<Set<string>>(new Set());
  const [intentResult, setIntentResult] = useState<any | null>(null);
  const [bitcoinQr, setBitcoinQr] = useState("");
  const [verificationResult, setVerificationResult] = useState<any | null>(null);
  const availableMethods = (paymentMethods?.methods || []).filter((m: any) => m.configured);
  const firstAvailableMethod = availableMethods[0]?.method as PaymentMethod | undefined;
  const isMethodAvailable = (method: PaymentMethod) => availableMethods.some((m: any) => m.method === method);

  useEffect(() => {
    if (!paymentMethods) return;
    if (!isMethodAvailable(paymentMethod) && firstAvailableMethod) {
      setPaymentMethod(firstAvailableMethod);
    }
  }, [paymentMethods, paymentMethod, firstAvailableMethod]);

  useEffect(() => {
    let cancelled = false;
    const uri = intentResult?.bitcoin?.paymentUri;
    if (!uri) {
      setBitcoinQr("");
      return;
    }

    QRCode.toDataURL(uri, { errorCorrectionLevel: "M", margin: 1, width: 240 })
      .then((value) => {
        if (!cancelled) {
          setBitcoinQr(value);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBitcoinQr("");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [intentResult?.bitcoin?.paymentUri]);

  if (campaignStatus === "LoadingFirstPage" || !stats || !balances) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-ifaccent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Stats come from lightweight query, not from loading all campaigns
  const totalRaised = balances.grandTotal?.raised || 0;
  const totalDonors = balances.grandTotal?.donors || 0;
  const activeCount = stats.activeCount || 0;

  const numericAmount = parseFloat(donationAmount) || 0;
  const isValidAmount = numericAmount >= MIN_AMOUNT;

  const handleCampaignView = (campaign: any) => {
    const campaignKey = campaign.ifCampaignId;
    if (!viewedCampaigns.has(campaignKey)) {
      setViewedCampaigns(prev => new Set([...prev, campaignKey]));
      recordInteraction({
        campaignId: campaign.ifCampaignId,
        campaignTitle: campaign.title,
        interactionType: "view",
      }).catch(() => {});
    }
  };

  const handleSupport = (campaign: any) => {
    handleCampaignView(campaign);
    recordInteraction({
      campaignId: campaign.ifCampaignId,
      campaignTitle: campaign.title,
      interactionType: "click",
    }).catch(() => {});

    setSelectedCampaign(campaign);
    setDonationAmount("25");
    setDonorName("");
    setDonationMessage("");
    setDonationRecurrence("one_time");
    setIntentResult(null);
    setVerificationResult(null);
    setDonationStep("amount");
  };

  const handleCloseModal = () => {
    setSelectedCampaign(null);
    setIntentResult(null);
    setVerificationResult(null);
    setDonationStep("amount");
  };

  const handleShare = (campaign: any) => {
    recordInteraction({
      campaignId: campaign.ifCampaignId,
      campaignTitle: campaign.title,
      interactionType: "share",
    }).catch(() => {});

    if (navigator.share) {
      navigator.share({
        title: campaign.title,
        text: `Support "${campaign.title}" on Interplanetary Fund!`,
        url: window.location.href,
      }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(window.location.href).catch(() => {});
    }
  };

  const handleCompleteDonation = async () => {
    if (!selectedCampaign || !isValidAmount) return;
    if (!isMethodAvailable(paymentMethod)) {
      alert("This payment method is not currently configured.");
      return;
    }
    setDonationStep("processing");
    try {
      const idempotencyKey = `${selectedCampaign.ifCampaignId}:${paymentMethod}:${numericAmount.toFixed(2)}:${Date.now()}`;
      const intent = await createDonationIntent({
        campaignId: selectedCampaign.ifCampaignId,
        campaignTitle: selectedCampaign.title,
        amountUSD: numericAmount,
        donorName: donorName || undefined,
        message: donationMessage || undefined,
        paymentMethod,
        recurrence: paymentMethod === "paypal" ? donationRecurrence : "one_time",
        idempotencyKey,
      });
      setIntentResult(intent);

      if (paymentMethod === "paypal") {
        if (!intent?.checkout?.url) {
          throw new Error("PayPal checkout is not available right now.");
        }
        window.open(intent.checkout.url, "_blank");
        setDonationStep("done");
        return;
      }

      if (paymentMethod === "cashapp") {
        if (!intent?.checkout?.url) {
          throw new Error("Cash App checkout is not available right now.");
        }
        window.open(intent.checkout.url, "_blank");
        setDonationStep("done");
        return;
      }

      setDonationStep("bitcoin");
    } catch (e: any) {
      setDonationStep("amount");
      alert(e?.message || "Something went wrong. Please try again.");
    }
  };

  const handleVerifyBitcoin = async () => {
    if (!intentResult?.donationId) return;
    try {
      const result = await verifyBitcoinDonation({ donationId: intentResult.donationId });
      setVerificationResult(result);
      if (result?.status === "confirmed") {
        setDonationStep("done");
      }
    } catch (e: any) {
      setVerificationResult({ status: "failed", reason: e?.message || "Verification failed" });
    }
  };

  return (
    <div className="space-y-5">
      {/* Hero Banner */}
      <div className="rounded-2xl bg-gradient-to-br from-ifaccent/20 to-ifcyan/10 border border-ifborder p-5">
        <h2 className="text-xl font-bold text-iftext">Together we can</h2>
        <p className="text-sm text-ifmuted mt-1">
          ${totalRaised.toLocaleString()} raised by {totalDonors} supporters
        </p>
        <div className="mt-3 flex gap-2">
          <div className="flex-1 h-1.5 bg-ifborder rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-ifaccent to-ifcyan rounded-full"
              style={{ width: `${totalRaised > 0 ? 68 : 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* Campaign Cards */}
      <div>
        <h3 className="text-sm font-semibold text-iftext mb-3">Active Campaigns</h3>
        <div className="space-y-4">
          {campaigns.length === 0 && (
            <div className="card text-center py-8">
              <p className="text-sm text-ifmuted">New campaigns coming soon!</p>
            </div>
          )}

          {campaigns.map((c: any) => {
            const progress = c.goalAmount > 0
              ? Math.min(100, Math.round((c.raisedAmount / c.goalAmount) * 100))
              : 0;

            return (
              <div key={c._id} className="card overflow-hidden">
                <div className="h-40 -mx-4 -mt-4 mb-3 overflow-hidden relative">
                  {c.coverImageUrl ? (
                    <img
                      src={c.coverImageUrl}
                      alt={c.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-ifaccent/30 to-ifcyan/20 flex items-center justify-center">
                      <span className="text-3xl font-bold text-ifaccent/60">{c.category}</span>
                    </div>
                  )}
                </div>

                <h4 className="text-sm font-semibold text-iftext">{c.title}</h4>
                {c.summary && (
                  <p className="text-xs text-ifmuted mt-1 line-clamp-2">{c.summary}</p>
                )}
                {c.fundraiserEventDescription && (
                  <p className="text-[11px] text-ifcyan mt-2 line-clamp-2">
                    Event: {c.fundraiserEventDescription}
                  </p>
                )}

                <div className="mt-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-iftext font-medium">
                      ${c.raisedAmount.toLocaleString()}
                    </span>
                    <span className="text-ifmuted">
                      of ${c.goalAmount.toLocaleString()}
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-ifborder rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-ifaccent to-ifcyan rounded-full transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-ifmuted mt-1">
                    <span>{progress}% funded</span>
                    <span>{c.donorCount} supporters</span>
                  </div>
                </div>

                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => handleSupport(c)}
                    className="flex-1 py-2.5 rounded-xl bg-ifaccent text-white text-sm font-semibold active:scale-[0.98] transition-transform"
                  >
                    Support
                  </button>
                  <button
                    onClick={() => handleShare(c)}
                    className="px-3 py-2.5 rounded-xl bg-ifborder text-iftext text-sm font-semibold active:scale-[0.98] transition-transform"
                  >
                    Share
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Load more campaigns */}
      {campaignStatus === "CanLoadMore" && (
        <button
          onClick={() => loadMore(8)}
          className="w-full py-3 rounded-xl border border-ifborder text-sm text-iftext font-semibold active:scale-[0.98] transition-transform"
        >
          Load more campaigns
        </button>
      )}
      {campaignStatus === "LoadingMore" && (
        <div className="flex items-center justify-center py-4">
          <div className="w-6 h-6 border-2 border-ifaccent border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Impact stats */}
      <div className="grid grid-cols-2 gap-3 pt-2">
        <div className="card text-center">
          <p className="text-2xl font-bold text-ifcyan">{activeCount}</p>
          <p className="text-[10px] text-ifmuted mt-1">Active campaigns</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-ifgreen">{totalDonors}</p>
          <p className="text-[10px] text-ifmuted mt-1">Total supporters</p>
        </div>
      </div>

      <div className="text-center py-4">
        <p className="text-[10px] text-ifmuted">Every dollar makes a difference</p>
      </div>

      {/* Donation Modal */}
      {selectedCampaign && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          onClick={handleCloseModal}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

          <div
            className="relative w-full max-w-md bg-ifcard rounded-t-3xl sm:rounded-3xl border border-ifborder p-6 space-y-4 animate-in max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleCloseModal}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-ifborder flex items-center justify-center text-ifmuted text-lg"
            >
              x
            </button>

            {/* Amount step */}
            {donationStep === "amount" && (
              <>
                <div>
                  <h3 className="text-base font-bold text-iftext">Support "{selectedCampaign.title}"</h3>
                  <p className="text-xs text-ifmuted mt-1">Enter any amount to donate</p>
                </div>

                {/* Big amount display */}
                <div className="text-center py-4">
                  <div className="flex items-center justify-center gap-1">
                    <span className="text-3xl font-bold text-ifmuted">$</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      value={donationAmount}
                      onChange={(e) => setDonationAmount(e.target.value)}
                      className="w-32 bg-transparent text-4xl font-bold text-iftext text-center outline-none"
                      placeholder="25"
                      autoFocus
                    />
                  </div>
                  {isValidAmount && (
                    <p className="text-xs text-ifgreen mt-2">
                      ${numericAmount.toLocaleString()} donation
                    </p>
                  )}
                  {!isValidAmount && donationAmount !== "" && (
                    <p className="text-xs text-red-400 mt-2">
                      Minimum donation is $1
                    </p>
                  )}
                </div>

                {/* Quick select chips */}
                <div className="flex flex-wrap gap-2 justify-center">
                  {PRESET_AMOUNTS.map((amt) => (
                    <button
                      key={amt}
                      onClick={() => setDonationAmount(String(amt))}
                      className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                        donationAmount === String(amt)
                          ? "bg-ifaccent text-white"
                          : "bg-ifborder text-iftext"
                      }`}
                    >
                      ${amt}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setDonationStep("info")}
                  disabled={!isValidAmount}
                  className="w-full py-3 rounded-xl bg-ifaccent text-white text-sm font-semibold active:scale-[0.98] transition-transform disabled:opacity-50"
                >
                  Continue
                </button>
              </>
            )}

            {/* Info step */}
            {donationStep === "info" && (
              <>
                <div>
                  <h3 className="text-base font-bold text-iftext">Almost there!</h3>
                  <p className="text-xs text-ifmuted mt-1">
                    Donating ${numericAmount.toLocaleString()} to "{selectedCampaign.title}"
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-ifmuted">Your name (optional)</label>
                    <input
                      type="text"
                      value={donorName}
                      onChange={(e) => setDonorName(e.target.value)}
                      className="mt-1 w-full bg-ifborder rounded-xl px-3 py-2.5 text-iftext text-sm outline-none"
                      placeholder="Anonymous"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-ifmuted">Message (optional)</label>
                    <textarea
                      value={donationMessage}
                      onChange={(e) => setDonationMessage(e.target.value)}
                      className="mt-1 w-full bg-ifborder rounded-xl px-3 py-2.5 text-iftext text-sm outline-none resize-none"
                      rows={2}
                      placeholder="Words of support..."
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-ifborder space-y-3">
                  <p className="text-xs text-ifmuted font-semibold">Choose payment method</p>
                  {!paymentMethods && (
                    <p className="text-[10px] text-ifmuted text-center">Loading payment options...</p>
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    {isMethodAvailable("paypal") && (
                      <button
                        onClick={() => setPaymentMethod("paypal")}
                        className={`py-2.5 rounded-xl border-2 text-xs font-semibold transition-colors ${
                          paymentMethod === "paypal"
                            ? "border-[#0070ba] bg-[#0070ba]/10 text-[#0070ba]"
                            : "border-ifborder text-ifmuted"
                        }`}
                      >
                        💙 PayPal
                      </button>
                    )}
                    {isMethodAvailable("cashapp") && (
                      <button
                        onClick={() => setPaymentMethod("cashapp")}
                        className={`py-2.5 rounded-xl border-2 text-xs font-semibold transition-colors ${
                          paymentMethod === "cashapp"
                            ? "border-green-500 bg-green-500/10 text-green-600"
                            : "border-ifborder text-ifmuted"
                        }`}
                      >
                        💚 CashApp
                      </button>
                    )}
                    {isMethodAvailable("bitcoin") && (
                      <button
                        onClick={() => setPaymentMethod("bitcoin")}
                        className={`py-2.5 rounded-xl border-2 text-xs font-semibold transition-colors ${
                          paymentMethod === "bitcoin"
                            ? "border-ifamber bg-ifamber/10 text-ifamber"
                            : "border-ifborder text-ifmuted"
                        }`}
                      >
                        ₿ Bitcoin
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-ifmuted text-center">
                    {paymentMethod === "paypal"
                      ? "Opens PayPal — pay with balance, card, or bank"
                      : paymentMethod === "cashapp"
                        ? "Opens CashApp — external link flow (not auto-confirmed)."
                        : "Shows Bitcoin address + QR and confirms on-chain after required confirmations."}
                  </p>
                  {paymentMethod === "paypal" && (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setDonationRecurrence("one_time")}
                        className={`py-2 rounded-xl border text-xs font-semibold ${
                          donationRecurrence === "one_time"
                            ? "border-[#0070ba] bg-[#0070ba]/10 text-[#0070ba]"
                            : "border-ifborder text-ifmuted"
                        }`}
                      >
                        One-time
                      </button>
                      <button
                        onClick={() => setDonationRecurrence("monthly")}
                        className={`py-2 rounded-xl border text-xs font-semibold ${
                          donationRecurrence === "monthly"
                            ? "border-[#0070ba] bg-[#0070ba]/10 text-[#0070ba]"
                            : "border-ifborder text-ifmuted"
                        }`}
                      >
                        Monthly
                      </button>
                    </div>
                  )}
                  <button
                    onClick={handleCompleteDonation}
                    className={`w-full py-3 rounded-xl text-white text-sm font-semibold active:scale-[0.98] transition-transform ${
                      paymentMethod === "paypal"
                        ? "bg-[#0070ba] hover:bg-[#005ea6]"
                        : paymentMethod === "cashapp"
                          ? "bg-green-600 hover:bg-green-700"
                          : "bg-ifamber hover:opacity-90"
                    }`}
                  >
                    Donate ${numericAmount.toLocaleString()} via {paymentMethod === "paypal" ? "PayPal" : paymentMethod === "cashapp" ? "CashApp" : "Bitcoin"}
                  </button>
                </div>
              </>
            )}

            {/* Processing step */}
            {donationStep === "processing" && (
              <div className="py-8 text-center">
                <div className="w-10 h-10 border-2 border-ifaccent border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-sm text-ifmuted mt-3">
                  Preparing {paymentMethod === "paypal" ? "PayPal" : paymentMethod === "cashapp" ? "CashApp" : "Bitcoin"} checkout...
                </p>
              </div>
            )}

            {/* Bitcoin step */}
            {donationStep === "bitcoin" && intentResult?.bitcoin && (
              <div className="space-y-3">
                <div>
                  <h3 className="text-base font-bold text-iftext">Send Bitcoin</h3>
                  <p className="text-xs text-ifmuted mt-1">
                    Donation #{intentResult.paymentReference}
                  </p>
                </div>
                {bitcoinQr && (
                  <img
                    src={bitcoinQr}
                    alt="Bitcoin payment QR code"
                    className="mx-auto w-48 h-48 rounded-xl bg-white p-2"
                  />
                )}
                <div className="bg-ifborder rounded-xl p-3 space-y-1 text-xs text-ifmuted break-all">
                  <p><span className="text-iftext font-semibold">USD:</span> ${numericAmount.toFixed(2)}</p>
                  <p><span className="text-iftext font-semibold">BTC:</span> {intentResult.bitcoin.btcAmount}</p>
                  <p><span className="text-iftext font-semibold">Address:</span> {intentResult.bitcoin.address}</p>
                  <p><span className="text-iftext font-semibold">Expires:</span> {new Date(intentResult.bitcoin.expiresAt).toLocaleString()}</p>
                  <p><span className="text-iftext font-semibold">Status:</span> {verificationResult?.status || intentResult.bitcoin.status}</p>
                </div>
                <button
                  onClick={handleVerifyBitcoin}
                  className="w-full py-3 rounded-xl bg-ifamber text-white text-sm font-semibold"
                >
                  Check blockchain status
                </button>
                {verificationResult?.nextVerificationAt && (
                  <p className="text-[10px] text-ifmuted text-center">
                    Next check available after {new Date(verificationResult.nextVerificationAt).toLocaleTimeString()}.
                  </p>
                )}
              </div>
            )}

            {/* Done step */}
            {donationStep === "done" && (
              <div className="py-6 text-center space-y-3">
                <div className="w-16 h-16 rounded-full bg-ifgreen/20 flex items-center justify-center mx-auto">
                  <span className="text-3xl">✓</span>
                </div>
                <div>
                  <h3 className="text-base font-bold text-iftext">Thank you!</h3>
                  <p className="text-sm text-ifmuted mt-1">
                    Your ${numericAmount.toLocaleString()} donation intent for "{selectedCampaign.title}" was created.
                  </p>
                  <div className="mt-3 bg-ifborder rounded-xl p-3 text-left space-y-1 text-xs">
                    <p><span className="text-ifmuted">Receipt:</span> <span className="text-iftext font-semibold">{intentResult?.paymentReference || "pending"}</span></p>
                    <p><span className="text-ifmuted">Method:</span> <span className="text-iftext font-semibold">{paymentMethod === "paypal" ? "PayPal" : paymentMethod === "cashapp" ? "CashApp" : "Bitcoin"}</span></p>
                    {paymentMethod === "paypal" && (
                      <p><span className="text-ifmuted">Type:</span> <span className="text-iftext font-semibold">{donationRecurrence === "monthly" ? "Recurring (Monthly)" : "One-time"}</span></p>
                    )}
                    <p><span className="text-ifmuted">Gross:</span> <span className="text-iftext font-semibold">${numericAmount.toFixed(2)}</span></p>
                    {paymentMethod === "paypal" && (
                      <>
                        <p><span className="text-ifmuted">Platform fee (5%):</span> <span className="text-iftext font-semibold">${(numericAmount * 0.05).toFixed(2)}</span></p>
                        <p><span className="text-ifmuted">Processing (2.9% + $0.30):</span> <span className="text-iftext font-semibold">${(numericAmount * 0.029 + 0.30).toFixed(2)}</span></p>
                        <p><span className="text-ifmuted">Net to owner:</span> <span className="text-iftext font-semibold">${(numericAmount - (numericAmount * 0.05) - (numericAmount * 0.029 + 0.30)).toFixed(2)}</span></p>
                      </>
                    )}
                  </div>
                  <p className="text-[10px] text-ifmuted mt-2">
                    {paymentMethod === "bitcoin"
                      ? "Bitcoin donations are only marked confirmed after on-chain verification and required confirmations."
                      : `Complete your payment in ${paymentMethod === "paypal" ? "PayPal" : "CashApp"} if it didn't open automatically.`}
                  </p>
                </div>
                {paymentMethod === "paypal" ? (
                  <a
                    href={intentResult?.checkout?.url || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full py-3 rounded-xl bg-[#0070ba] text-white text-sm font-semibold text-center"
                  >
                    Open PayPal
                  </a>
                ) : paymentMethod === "cashapp" ? (
                  <a
                    href={intentResult?.checkout?.url || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full py-3 rounded-xl bg-green-600 text-white text-sm font-semibold text-center"
                  >
                    Open CashApp
                  </a>
                ) : (
                  <div className="w-full py-3 rounded-xl bg-ifborder text-iftext text-sm font-semibold text-center">
                    Bitcoin status: {verificationResult?.status || intentResult?.status || "pending"}
                  </div>
                )}
                <button
                  onClick={handleCloseModal}
                  className="w-full py-3 rounded-xl bg-ifborder text-iftext text-sm font-semibold"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
