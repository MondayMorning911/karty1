import React, { useState } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { RealtorProfile, Property, DesignSettings } from '../types';
import { MOCK_PROPERTIES } from '../data';
import { Download, Phone, User, BedDouble, Bath, Maximize, MapPin } from 'lucide-react';

interface Props {
  profile: RealtorProfile;
  selectedProperties: string[];
  customProperties: Property[];
  design: DesignSettings;
}

export function StepPreview({ profile, selectedProperties, customProperties, design }: Props) {
  const allProps = [...customProperties, ...MOCK_PROPERTIES];
  const properties = allProps.filter(p => selectedProperties.includes(p.id));

  const isDarkColor = (color: string) => {
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return yiq < 128;
  };
  const headerTextColor = isDarkColor(design.primaryColor) ? '#FFFFFF' : '#000000';

  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const handleDownload = () => {
    setIsGeneratingPdf(true);
    
    setTimeout(async () => {
      const element = document.getElementById('pdf-content');
      if (!element) {
        setIsGeneratingPdf(false);
        return;
      }
      
      try {
        const canvas = await html2canvas(element, {
          scale: 2,
          logging: true,
          windowWidth: 800,
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.95);

        const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4'
        });

        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        
        let position = 0;
        pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight);
        let heightLeft = pdfHeight - pageHeight;

        while (heightLeft > 0) {
          position = position - pageHeight;
          pdf.addPage();
          pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight);
          heightLeft -= pageHeight;
        }
        
        pdf.save('Подборка_Объектов.pdf');
      } catch (err) {
        console.error('Failed to generate PDF', err);
        // Fallback to native print dialog
        alert('Используется стандартная печать браузера. Выберите "Сохранить как PDF" в появившемся окне.');
        window.print();
      } finally {
        setIsGeneratingPdf(false);
      }
    }, 500);
  };

  return (
    <div className="space-y-4 print:space-y-0">
      <div className="flex justify-end mb-2 print:hidden">
        <button 
          onClick={handleDownload}
          disabled={isGeneratingPdf}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 rounded-full text-white text-sm font-semibold shadow-lg shadow-blue-200 transition-opacity hover:opacity-90 active:scale-95 disabled:opacity-50"
        >
          <Download className={`w-4 h-4 ${isGeneratingPdf ? 'animate-bounce' : ''}`} />
          <span>{isGeneratingPdf ? 'Генерация PDF...' : 'Скачать PDF'}</span>
        </button>
      </div>

      <div className={`bg-white shadow-xl overflow-hidden relative ${isGeneratingPdf ? '' : 'rounded-xl border border-slate-200 print:shadow-none print:border-none print:rounded-none'}`}>
        
        {/* PDF Content Container */}
        <div id="pdf-content" className={`w-full flex flex-col ${design.fontFamily} ${isGeneratingPdf ? 'bg-white w-[210mm] min-h-[297mm] mx-auto' : 'bg-white min-h-[500px] print:w-[210mm] print:mx-auto print:bg-white'}`}>
          
          {/* Header */}
          {(profile.name || profile.agency || profile.phone || profile.photoUrl) && (
            <div 
              className="p-6 md:p-8 flex items-center justify-between shadow-sm z-10 relative print:p-8 print:shadow-none print:border-b print:border-slate-200"
              style={{ backgroundColor: design.primaryColor, color: headerTextColor }}
            >
              <div className="flex items-center gap-4">
                {profile.photoUrl ? (
                  <img src={profile.photoUrl} alt="Avatar" className="w-14 h-14 rounded-lg object-cover border-2 border-white/20 shadow-sm print:border-slate-200" />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-white/20 flex items-center justify-center shadow-sm">
                    <User className="w-6 h-6 opacity-80" />
                  </div>
                )}
                <div>
                  <h1 className="text-lg md:text-xl font-bold tracking-tight leading-tight">{profile.name || 'Имя Риэлтора'}</h1>
                  <p className="text-[11px] md:text-xs opacity-90 font-medium mt-0.5">{profile.agency || 'Название Агентства'}</p>
                </div>
              </div>
              <div className="text-right hidden sm:block print:block">
                 <div className="flex items-center justify-end gap-1.5 text-xs opacity-90 font-bold bg-black/10 px-3 py-1.5 rounded-full backdrop-blur-sm print:bg-transparent print:px-0">
                    <Phone className="w-3.5 h-3.5" />
                    <span>{profile.phone || '+7 (999) 000-00-00'}</span>
                 </div>
              </div>
            </div>
          )}

          {/* Properties List */}
          <div 
            className="p-4 sm:p-6 md:p-8 space-y-6 flex-1 print:bg-white print:p-8 print:space-y-12"
            style={{ backgroundColor: design.secondaryColor || '#f8fafc' }}
          >
            <div className="text-center mb-6 pt-2 print:mb-12">
               <h2 className="text-[11px] md:text-xs font-bold text-slate-400 uppercase tracking-widest print:text-slate-500">Подборка объектов</h2>
               <div className="w-12 h-1 mx-auto mt-3 mb-2 rounded-full print:mb-6" style={{ backgroundColor: design.primaryColor }}></div>
               <p className="text-[10px] text-slate-400 italic print:hidden">*В PDF-файле все фотографии будут отображены в полном размере</p>
            </div>

            {properties.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm font-medium">
                Объекты не выбраны.
              </div>
            ) : (
              <div className="space-y-12 print:space-y-16">
                {properties.map((prop, index) => (
                  <div 
                    key={prop.id} 
                    className={`flex flex-col bg-white overflow-hidden shadow-sm print:break-inside-avoid print:shadow-none print:border print:border-slate-200 print:rounded-2xl ${
                      design.layout === 'classic' ? 'border border-slate-200 rounded-xl' :
                      design.layout === 'modern' ? 'rounded-2xl border-none shadow-lg' :
                      'border-t-4 rounded-b-xl border-x border-b border-slate-200'
                    }`}
                    style={design.layout === 'editorial' ? { borderTopColor: design.primaryColor } : {}}
                  >
                    
                    {/* Header for Modern layout */}
                    {design.layout === 'modern' && (
                      <div className="p-5 md:p-6 pb-4">
                        <div className="flex justify-between items-start gap-4 mb-2">
                          <h3 className="text-xl md:text-2xl font-bold text-slate-900 leading-tight">{prop.title}</h3>
                          <div className="bg-slate-50 px-3 py-1.5 rounded-lg shrink-0 print:bg-transparent print:px-0">
                            <span className="font-bold text-sm md:text-base print:text-lg" style={{ color: design.primaryColor }}>{prop.price}</span>
                          </div>
                        </div>
                        <p className="text-sm font-medium text-slate-500">{prop.address}</p>
                      </div>
                    )}

                    {/* Main Image */}
                    <div className="w-full aspect-[16/9] relative bg-slate-100">
                      <img src={prop.images?.[0]} alt={prop.title} className="w-full h-full object-cover" />
                      
                      {/* Price Tag for non-modern layouts */}
                      {design.layout !== 'modern' && (
                        <div className="absolute top-4 right-4 bg-white/95 backdrop-blur-sm px-3 py-1.5 rounded-lg shadow-lg print:shadow-sm print:border print:border-slate-100">
                          <span className="font-bold text-sm md:text-base print:text-lg" style={{ color: design.primaryColor }}>{prop.price}</span>
                        </div>
                      )}
                    </div>
                    
                    {/* Content Section */}
                    <div className="p-5 md:p-6 flex flex-col print:p-8">
                      {/* Header for Classic & Editorial */}
                      {design.layout !== 'modern' && (
                        <div className="mb-5">
                          <h3 className="text-lg md:text-xl font-bold text-slate-900 leading-tight mb-1">{prop.title}</h3>
                          <p className="text-xs text-slate-500 font-medium">{prop.address}</p>
                        </div>
                      )}
                      
                      <div className={`flex flex-col gap-5 ${design.layout === 'editorial' ? 'md:flex-row-reverse' : ''}`}>
                        
                        {/* Specs */}
                        <div className={`flex gap-4 border-b border-slate-100 pb-5 ${design.layout === 'editorial' ? 'md:flex-col md:border-b-0 md:border-l md:pl-5 md:pb-0 md:w-32 shrink-0 print:border-slate-200' : 'grid grid-cols-3 print:border-slate-200'}`}>
                          <div>
                            <p className="text-[9px] text-slate-400 uppercase font-bold mb-1 tracking-wider print:text-slate-500">Спальни</p>
                            <p className="text-sm font-bold text-slate-800 flex items-center gap-1.5"><BedDouble className="w-4 h-4 text-slate-400 print:text-slate-500" /> {prop.specs.beds}</p>
                          </div>
                          <div>
                            <p className="text-[9px] text-slate-400 uppercase font-bold mb-1 tracking-wider print:text-slate-500">Ванные</p>
                            <p className="text-sm font-bold text-slate-800 flex items-center gap-1.5"><Bath className="w-4 h-4 text-slate-400 print:text-slate-500" /> {prop.specs.baths}</p>
                          </div>
                          <div>
                            <p className="text-[9px] text-slate-400 uppercase font-bold mb-1 tracking-wider print:text-slate-500">Площадь</p>
                            <p className="text-sm font-bold text-slate-800 flex items-center gap-1.5"><Maximize className="w-4 h-4 text-slate-400 print:text-slate-500" /> {prop.specs.sqft} м²</p>
                          </div>
                        </div>

                        <div className="flex-1 flex flex-col sm:flex-row gap-5 print:flex-col">
                          <div className="flex-1">
                            {prop.description && (
                              <p className="text-sm text-slate-600 leading-relaxed mb-5 print:text-base print:text-slate-700">
                                {prop.description}
                              </p>
                            )}
                            
                            {prop.images && prop.images.length > 1 && (
                              <>
                                {/* Web layout images */}
                                <div className={`grid grid-cols-2 gap-2 mt-2 ${isGeneratingPdf ? 'hidden' : 'print:hidden'}`}>
                                  {prop.images.slice(1, 3).map((img, i) => (
                                    <img key={i} src={img} className="w-full h-24 object-cover rounded-lg shadow-sm" alt="Property view" />
                                  ))}
                                </div>
                                {/* Print layout images */}
                                <div className={`${isGeneratingPdf ? 'grid' : 'hidden print:grid'} grid-cols-2 gap-4 mt-6`}>
                                  {prop.images.slice(1).map((img, i) => (
                                    <img key={`pdf-${i}`} src={img} className="w-full h-48 object-cover rounded-xl shadow-sm border border-slate-100" alt="Full Property view" />
                                  ))}
                                </div>
                              </>
                            )}
                          </div>

                          {prop.mapUrl && (
                             <div className={`w-full shrink-0 ${isGeneratingPdf ? 'w-full mt-6' : 'sm:w-[140px] print:w-full print:mt-6'}`}>
                               <p className={`text-[10px] uppercase font-bold mb-2 tracking-wider ${isGeneratingPdf ? 'text-sm text-slate-500' : 'text-slate-400 print:text-sm print:text-slate-500'}`}>На карте</p>
                               <img src={prop.mapUrl} className={`w-full object-cover rounded-lg shadow-sm border border-slate-100 ${isGeneratingPdf ? 'h-64' : 'h-32 print:h-64'}`} alt="Map Location" />
                             </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {/* Footer */}
          {(profile.name || profile.agency) && (
            <div className="p-6 text-center text-xs font-medium mt-auto bg-slate-900 text-slate-400 print:bg-white print:border-t print:border-slate-200 print:text-slate-500 print:mt-12">
               Подготовлено специально для вас • {profile.name || 'Риэлтор'} {profile.agency && `(${profile.agency})`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
