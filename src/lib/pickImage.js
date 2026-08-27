// src/lib/pickImage.js
//
// دالة موحّدة لاختيار صورة (بطاقة شخصية / إسكرين تحويل):
//   - جوه تطبيق Capacitor (أندرويد الحقيقي) → بتفتح بوب-أب نيتيف
//     "الكاميرا / معرض الصور" حقيقي عن طريق @capacitor/camera
//   - في المتصفح العادي (PWA / تجربة الويب) → ترجع تلقائيًا لنفس سلوك
//     <input type="file"> القديم، من غير ما تكسر أي حاجة
//
// الاستخدام:
//   import { pickImage } from "../lib/pickImage";
//   const file = await pickImage({ fileNamePrefix: "id-card" });
//   if (!file) return; // المستخدم قفل البوب-أب / لغى الاختيار
//   // file هنا كائن File عادي — نفس الشكل اللي الكود الحالي متعامل معاه
//   // (file.type / file.size / file.name / يتبعت زي ما هو لـ supabase.storage.upload)

// بنعمل import ديناميكي لـ @capacitor/core و @capacitor/camera عشان لو
// الباكدجات دي مش متركبة (مثلاً وقت تشغيل نسخة الويب بس من غير Capacitor)
// الكود ميكسرش على طول من غير ما نحتاجها فعليًا.

let capacitorCoreModule = null;
async function getCapacitorCore() {
  if (capacitorCoreModule) return capacitorCoreModule;
  try {
    capacitorCoreModule = await import("@capacitor/core");
  } catch {
    capacitorCoreModule = { Capacitor: { isNativePlatform: () => false } };
  }
  return capacitorCoreModule;
}

let cameraModule = null;
async function getCameraModule() {
  if (cameraModule) return cameraModule;
  cameraModule = await import("@capacitor/camera");
  return cameraModule;
}

// بيحوّل dataUrl (base64) اللي بترجعه الكاميرا لكائن File عادي، عشان يفضل
// شغال بنفس الشكل مع باقي الكود (URL.createObjectURL / FileReader /
// supabase.storage.upload) من غير أي تعديل تاني في باقي المشروع.
function dataUrlToFile(dataUrl, fileName) {
  const [header, base64Data] = dataUrl.split(",");
  const mimeMatch = header.match(/data:(.*?);base64/);
  const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], fileName, { type: mime });
}

// بيفتح input file عادي مخفي وبيرجع الملف اللي اتختار (أو null لو المستخدم لغى).
// ده نفس سلوك الويب القديم بالظبط.
function pickImageWeb() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.style.display = "none";

    // بعض المتصفحات (خصوصًا على الموبايل) محتاجة الـ input يكون فعليًا
    // موجود جوه الصفحة وقت الـ click عشان يفتح صح.
    document.body.appendChild(input);

    let settled = false;
    const cleanup = () => {
      if (input.parentNode) input.parentNode.removeChild(input);
    };

    input.addEventListener("change", () => {
      settled = true;
      const file = input.files && input.files[0] ? input.files[0] : null;
      cleanup();
      resolve(file);
    });

    // لو المستخدم قفل بوب-أب اختيار الملف من غير ما يختار حاجة، مفيش
    // event موحّد لكل المتصفحات لالتقاط ده، فبنعتمد على "focus" رجوعه
    // للصفحة كإشارة تقريبية إن الاختيار خلص (لو already resolved بالـ
    // change event، الاستدعاء ده هيتجاهل).
    window.addEventListener(
      "focus",
      () => {
        setTimeout(() => {
          if (!settled) {
            settled = true;
            cleanup();
            resolve(null);
          }
        }, 300);
      },
      { once: true }
    );

    input.click();
  });
}

/**
 * @param {Object} options
 * @param {string} [options.fileNamePrefix] - بادئة اسم الملف الناتج من الكاميرا (مفيش امتداد)
 * @returns {Promise<File|null>} كائن File عادي، أو null لو المستخدم لغى الاختيار
 */
export async function pickImage({ fileNamePrefix = "photo" } = {}) {
  const { Capacitor } = await getCapacitorCore();

  if (!Capacitor.isNativePlatform || !Capacitor.isNativePlatform()) {
    // مش جوه تطبيق نيتيف (يعني بنشتغل كـ PWA/متصفح) → السلوك القديم بالظبط
    return pickImageWeb();
  }

  try {
    const { Camera, CameraResultType, CameraSource } = await getCameraModule();
    const photo = await Camera.getPhoto({
      quality: 80,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Prompt, // بيوريه بوب-أب "الكاميرا / معرض الصور"
      promptLabelHeader: "اختار صورة",
      promptLabelPhoto: "معرض الصور",
      promptLabelPicture: "الكاميرا",
      promptLabelCancel: "إلغاء",
      correctOrientation: true,
    });

    if (!photo?.dataUrl) return null;

    const fileName = `${fileNamePrefix}-${Date.now()}.jpg`;
    return dataUrlToFile(photo.dataUrl, fileName);
  } catch (err) {
    // المستخدم لغى البوب-أب أو رفض صلاحية الكاميرا/المعرض — نرجع null
    // زي بالظبط لما يقفل input الملف في المتصفح من غير اختيار.
    return null;
  }
}
