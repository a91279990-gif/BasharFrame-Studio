import { Translations } from '../utils/i18n';

interface WorkflowSectionProps {
  t: Translations;
}

export function WorkflowSection({ t }: WorkflowSectionProps) {
  const steps = [
    {
      num: '০১. যেকোনো ভিডিও লোড করুন',
      detail:
        'আপনার MP4, WebM বা MOV ভিডিও ড্রপ করুন অথবা তৈরি থাকা স্টুডিও ক্লিপ দিয়ে সরাসরি পরীক্ষা করুন।',
    },
    {
      num: '০২. বাইরের কালারিং সাজান',
      detail:
        'রঙ শুধুমাত্র ভিডিওর বাইরের চারদিকে ঘুরবে—স্পেকট্রাম, ব্লার, পুরুত্ব এবং ঘূর্ণনের গতি পছন্দমতো সেট করুন।',
    },
    {
      num: '০৩. দ্রুত রেন্ডার ও ডাউনলোড',
      detail:
        'ঘূর্ণায়মান বর্ডার ও মূল অডিওসহ সম্পূর্ণ ভিডিও সরাসরি ডাউনলোড করে ব্যবহার করুন।',
    },
  ];

  return (
    <section id="workflow" className="pt-8 border-t border-white/[0.08] space-y-5">
      <h2 className="font-display text-lg sm:text-xl font-semibold text-zinc-100">
        {t.guideTitle}
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {steps.map((step) => (
          <div
            key={step.num}
            className="rounded-xl border border-white/[0.08] bg-[#121216] p-5 space-y-2.5"
          >
            <h3 className="font-display text-sm font-semibold text-zinc-100">
              {step.num}
            </h3>
            <p className="text-sm text-zinc-400 leading-relaxed">
              {step.detail}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
